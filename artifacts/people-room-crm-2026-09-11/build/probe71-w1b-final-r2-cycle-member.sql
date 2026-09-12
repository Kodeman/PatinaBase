BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, created_at, updated_at)
VALUES ('aaaa1111-0000-4000-8000-00000000f001','00000000-0000-0000-0000-000000000000','plainmember@example.test','x',now(),'authenticated','authenticated',now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, full_name) VALUES ('aaaa1111-0000-4000-8000-00000000f001','plainmember@example.test','Plain Member') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('aaaa1111-0000-4000-8000-00000000f001','b0000000-0000-0000-0000-000000000001','member','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role='member', status='active';

SELECT pg_temp.assume_user('aaaa1111-0000-4000-8000-00000000f001');

\echo '--- PATH 2: the two-row supersede CYCLE. A second lapsed COI of the same type and date. ---'
WITH firm AS (SELECT id, organization_id FROM public.studio_contacts WHERE company_name='Northgate Electric')
INSERT INTO public.studio_compliance_documents (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
SELECT organization_id,'company',id,'coi_gl', DATE '2026-03-31', ARRAY['site_access','draw'] FROM firm
RETURNING id AS b \gset
UPDATE public.studio_compliance_documents SET superseded_by = :'b'
 WHERE id='d0e50000-0000-0000-0000-000000000006';
UPDATE public.studio_compliance_documents SET superseded_by = 'd0e50000-0000-0000-0000-000000000006'
 WHERE id = :'b';
SELECT display_name, paper_state AS after_the_cycle FROM public.people_directory WHERE display_name='Northgate Electric';
SELECT doc_type, expires_on, blocks, (superseded_by IS NOT NULL) AS superseded
  FROM public.studio_compliance_documents
 WHERE holder_id=(SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric')
 ORDER BY doc_type, expires_on NULLS LAST;
ROLLBACK;
