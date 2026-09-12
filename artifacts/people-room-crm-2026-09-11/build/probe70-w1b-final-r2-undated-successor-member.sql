BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, created_at, updated_at)
VALUES ('aaaa1111-0000-4000-8000-00000000f001','00000000-0000-0000-0000-000000000000','plainmember@example.test','x',now(),'authenticated','authenticated',now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, full_name) VALUES ('aaaa1111-0000-4000-8000-00000000f001','plainmember@example.test','Plain Member') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('aaaa1111-0000-4000-8000-00000000f001','b0000000-0000-0000-0000-000000000001','member','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role='member', status='active';

SELECT pg_temp.assume_user('aaaa1111-0000-4000-8000-00000000f001');

\echo '--- 1. what the room prints for Northgate Electric, as the member, before any act ---'
SELECT display_name, paper_state FROM public.people_directory WHERE display_name='Northgate Electric';
SELECT display_name, paper_state FROM public.people_directory WHERE display_name='Dana Kowalski';

\echo '--- 2. PATH 1: an UNDATED coi_gl, then point the lapsed one at it (2 ordinary writes) ---'
WITH firm AS (SELECT id, organization_id FROM public.studio_contacts WHERE company_name='Northgate Electric')
INSERT INTO public.studio_compliance_documents (organization_id, holder_type, holder_id, doc_type, issuer, blocks)
SELECT organization_id,'company',id,'coi_gl','Acme Mutual (renewal, no date typed)', ARRAY['site_access','draw'] FROM firm
RETURNING id AS newid \gset
UPDATE public.studio_compliance_documents SET superseded_by = :'newid'
 WHERE doc_type='coi_gl' AND expires_on = DATE '2026-03-31'
   AND holder_id=(SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric');
SELECT display_name, paper_state AS after_path_1 FROM public.people_directory WHERE display_name='Northgate Electric';
SELECT display_name, paper_state AS dana_after_path_1 FROM public.people_directory WHERE display_name='Dana Kowalski';
\echo '    the record still holds the lapse:'
SELECT doc_type, expires_on, blocks, (superseded_by IS NOT NULL) AS superseded
  FROM public.studio_compliance_documents
 WHERE holder_id=(SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric')
 ORDER BY doc_type, expires_on NULLS LAST;
ROLLBACK;
