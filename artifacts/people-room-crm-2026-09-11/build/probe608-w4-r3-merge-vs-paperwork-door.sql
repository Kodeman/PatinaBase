\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public;
INSERT INTO organizations (id, name, slug, type) VALUES
  ('fb000000-0000-4000-8000-000000000001','R3 Studio A','r3-studio-a','design_studio');
INSERT INTO auth.users (id, email, aud, role, instance_id) VALUES
  ('fb000000-0000-4000-8000-0000000000a1','r3a@example.com','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
INSERT INTO organization_members (organization_id, user_id, role, status) VALUES
  ('fb000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-0000000000a1','owner','active');
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by) VALUES
  ('fb000000-0000-4000-8000-0000000000c1','fb000000-0000-4000-8000-000000000001','company','trade','Northgate Electric','fb000000-0000-4000-8000-0000000000a1'),
  ('fb000000-0000-4000-8000-0000000000c9','fb000000-0000-4000-8000-000000000001','company','trade','Northgate Electric LLC','fb000000-0000-4000-8000-0000000000a1');
INSERT INTO studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks, source, inbound, verified_by, verified_at)
VALUES ('fb000000-0000-4000-8000-0000000000d1','fb000000-0000-4000-8000-000000000001','company',
        'fb000000-0000-4000-8000-0000000000c9','coi_gl', CURRENT_DATE + 200, ARRAY['site_access']::text[],
        'studio', false, 'fb000000-0000-4000-8000-0000000000a1', now());

CREATE TABLE pg_temp_probe_t608 (id uuid, token text, expires_at timestamptz);
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);
-- the door is minted on the DUPLICATE card (c9), which is the one the studio then merges away
INSERT INTO pg_temp_probe_t608 SELECT * FROM public.mint_paperwork_link('fb000000-0000-4000-8000-0000000000c9', now() + interval '20 days');

\echo '--- before the merge: the firm reads its own paper'
RESET role; SELECT set_config('request.jwt.claims', NULL, true);
SELECT jsonb_pretty(public.resolve_paperwork_link((SELECT token FROM pg_temp_probe_t608), false));

\echo '--- merge c9 INTO c1'
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);
SELECT public.merge_studio_contacts('fb000000-0000-4000-8000-0000000000c1','fb000000-0000-4000-8000-0000000000c9','company_name') IS NOT NULL AS merged;
RESET role; SELECT set_config('request.jwt.claims', NULL, true);

\echo '--- the token still names the ABSORBED card'
SELECT company_id, status, expires_at > now() AS live FROM paperwork_link_tokens;
\echo '--- the documents moved to the survivor'
SELECT id, holder_id FROM studio_compliance_documents WHERE id='fb000000-0000-4000-8000-0000000000d1';
\echo '--- what the firm now reads on its live link'
SELECT jsonb_pretty(public.resolve_paperwork_link((SELECT token FROM pg_temp_probe_t608), false));
\echo '--- and where a new upload lands'
SELECT public.record_inbound_compliance_document(
  (SELECT token FROM pg_temp_probe_t608),'w9',NULL,NULL,NULL,NULL,NULL,'x/y/z/w9.pdf') AS doc \gset
SELECT holder_id, holder_type FROM studio_compliance_documents WHERE id=:'doc';
\echo '--- does the SURVIVOR card (the one the studio opens) see the inbound queue?'
SELECT count(*) AS pending_on_survivor FROM studio_compliance_documents
 WHERE holder_id='fb000000-0000-4000-8000-0000000000c1' AND inbound AND verified_at IS NULL AND rejected_at IS NULL;
SELECT count(*) AS pending_on_absorbed FROM studio_compliance_documents
 WHERE holder_id='fb000000-0000-4000-8000-0000000000c9' AND inbound AND verified_at IS NULL AND rejected_at IS NULL;
\echo '--- and the survivor card mint: R-AF now lets the firm hold TWO live doors'
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);
SELECT count(*) FROM public.mint_paperwork_link('fb000000-0000-4000-8000-0000000000c1', now() + interval '20 days');
RESET role;
SELECT count(*) FILTER (WHERE status='active') AS live_doors_for_one_firm FROM paperwork_link_tokens;
ROLLBACK;
