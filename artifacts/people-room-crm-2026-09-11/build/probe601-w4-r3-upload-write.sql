\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public;

INSERT INTO organizations (id, name, slug, type) VALUES
  ('fb000000-0000-4000-8000-000000000001','R3 Studio A','r3-studio-a','design_studio'),
  ('fb000000-0000-4000-8000-000000000002','R3 Studio B','r3-studio-b','design_studio');
INSERT INTO auth.users (id, email, aud, role, instance_id) VALUES
  ('fb000000-0000-4000-8000-0000000000a1','r3a@example.com','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
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
  ('fb000000-0000-4000-8000-0000000000c1','fb000000-0000-4000-8000-000000000001','company','trade','R3 Firm A','fb000000-0000-4000-8000-0000000000a4'),
  ('fb000000-0000-4000-8000-0000000000c2','fb000000-0000-4000-8000-000000000002','company','trade','R3 Firm B','fb000000-0000-4000-8000-0000000000a2');

-- A verified, gated COI already on Firm A.
INSERT INTO studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks, source, inbound, verified_by, verified_at)
VALUES ('fb000000-0000-4000-8000-0000000000d1','fb000000-0000-4000-8000-000000000001','company',
        'fb000000-0000-4000-8000-0000000000c1','coi_gl', CURRENT_DATE + 200,
        ARRAY['site_access','payment']::text[], 'studio', false,
        'fb000000-0000-4000-8000-0000000000a1', now());

-- mint as the plain member a4 so R-AC's "plus the minter" leg is testable
CREATE TABLE pg_temp_probe_t (id uuid, token text, expires_at timestamptz);
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a4','role','authenticated')::text, true);
INSERT INTO pg_temp_probe_t SELECT * FROM public.mint_paperwork_link('fb000000-0000-4000-8000-0000000000c1', now() + interval '10 days');
RESET role;
SELECT set_config('request.jwt.claims', NULL, true);

\echo '--- 1. storage context comes from the TOKEN'
SELECT * FROM public.paperwork_link_storage_context((SELECT token FROM pg_temp_probe_t));

\echo '--- 2. the write lands on the TOKEN''s firm, unverified, inbound, gates inherited'
SELECT public.record_inbound_compliance_document(
  (SELECT token FROM pg_temp_probe_t), 'coi_gl', NULL, 'NUM-1', 'Acme Mutual',
  CURRENT_DATE, CURRENT_DATE + 365,
  (SELECT organization_id||'/'||company_id||'/'||gen_random_uuid()||'/coi.pdf' FROM public.paperwork_link_storage_context((SELECT token FROM pg_temp_probe_t)))
) AS new_doc \gset
SELECT holder_id, organization_id, inbound, verified_at, rejected_at, source, blocks, file_path
FROM studio_compliance_documents WHERE id = :'new_doc';

\echo '--- 3. the previously VERIFIED row is untouched'
SELECT id, verified_at IS NOT NULL AS still_verified, superseded_by, rejected_at
FROM studio_compliance_documents WHERE id='fb000000-0000-4000-8000-0000000000d1';

\echo '--- 4. R-AC recipients: owners + admins + the minter, one row each'
SELECT n.user_id, om.role
FROM notification_log n LEFT JOIN organization_members om
  ON om.user_id=n.user_id AND om.organization_id='fb000000-0000-4000-8000-000000000001'
WHERE n.type='compliance_document_inbound' AND (n.metadata->>'company_id')='fb000000-0000-4000-8000-0000000000c1' ORDER BY om.role NULLS LAST;
SELECT count(*) AS rows_total, count(DISTINCT user_id) AS distinct_users
FROM notification_log WHERE type='compliance_document_inbound' AND (metadata->>'company_id')='fb000000-0000-4000-8000-0000000000c1';

\echo '--- 5. FORGED file_path: the RPC stores whatever it is given (minor 11 re-check)'
SELECT public.record_inbound_compliance_document(
  (SELECT token FROM pg_temp_probe_t), 'w9', NULL, NULL, NULL, NULL, NULL,
  'fb000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-0000000000c2/x/forged.pdf') AS forged \gset
SELECT holder_id, organization_id, file_path FROM studio_compliance_documents WHERE id=:'forged';

\echo '--- 6. the firm''s page never sees the other studio''s paper'
SELECT jsonb_pretty(public.resolve_paperwork_link((SELECT token FROM pg_temp_probe_t), false));

\echo '--- 7. revoke kills every read with one silence'
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);
SELECT public.revoke_paperwork_link((SELECT id FROM pg_temp_probe_t), 'done');
RESET role;
SELECT set_config('request.jwt.claims', NULL, true);
SELECT public.resolve_paperwork_link((SELECT token FROM pg_temp_probe_t), false) IS NULL AS resolve_null,
       (SELECT count(*) FROM public.paperwork_link_storage_context((SELECT token FROM pg_temp_probe_t))) AS ctx_rows;
DO $$
BEGIN
  PERFORM public.record_inbound_compliance_document((SELECT token FROM pg_temp_probe_t),'w9',NULL,NULL,NULL,NULL,NULL,'x');
  RAISE EXCEPTION 'FAIL: revoked token wrote a row';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: revoked token refused (%)', SQLERRM;
END $$;
ROLLBACK;
