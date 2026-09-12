BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, created_at, updated_at)
VALUES ('bbbb2222-0000-4000-8000-00000000b001','00000000-0000-0000-0000-000000000000','beta-owner@example.test','x',now(),'authenticated','authenticated',now(),now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, full_name, is_designer) VALUES ('bbbb2222-0000-4000-8000-00000000b001','beta-owner@example.test','Beta Owner',true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id, type, name, slug, status) VALUES ('bbbb2222-0000-4000-8000-00000000ac01','design_studio','Studio Beta','studio-beta-probe','active') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES ('bbbb2222-0000-4000-8000-00000000b001','bbbb2222-0000-4000-8000-00000000ac01','owner','active',now()) ON CONFLICT (user_id, organization_id) DO UPDATE SET status='active';
INSERT INTO public.projects (id, name, designer_id, studio_id, status, created_by) VALUES ('bbbb2222-0000-4000-8000-00000000aa01','Beta remodel','bbbb2222-0000-4000-8000-00000000b001','bbbb2222-0000-4000-8000-00000000ac01','active','bbbb2222-0000-4000-8000-00000000b001') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, stage) VALUES ('bbbb2222-0000-4000-8000-00000000dd01','bbbb2222-0000-4000-8000-00000000aa01','sub','Beta Seat','active') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.project_site_access_cards (id, project_id, lockbox_version) VALUES ('bbbb2222-0000-4000-8000-00000000ab01','bbbb2222-0000-4000-8000-00000000aa01','beta v3') ON CONFLICT (id) DO NOTHING;

SELECT pg_temp.assume_user('bbbb2222-0000-4000-8000-00000000b001');
\echo '--- BETA points its own seat at ALPHA''s firm card (literal id) ---'
SAVEPOINT a;
UPDATE public.project_parties SET company_id='d0e20000-0000-0000-0000-000000000003' WHERE id='bbbb2222-0000-4000-8000-00000000dd01';
ROLLBACK TO a;
\echo '--- BETA points warranty_contact_person_id at ALPHA''s person card ---'
SAVEPOINT b;
UPDATE public.project_parties SET warranty_contact_person_id='d0e10000-0000-0000-0000-000000000011' WHERE id='bbbb2222-0000-4000-8000-00000000dd01';
ROLLBACK TO b;
\echo '--- BETA files a compliance document against ALPHA''s firm card ---'
SAVEPOINT c;
INSERT INTO public.studio_compliance_documents (organization_id, holder_type, holder_id, doc_type)
VALUES ('bbbb2222-0000-4000-8000-00000000ac01','company','d0e20000-0000-0000-0000-000000000003','w9');
ROLLBACK TO c;
\echo '--- BETA names an ALPHA seat as its site-access key holder ---'
SAVEPOINT d;
UPDATE public.project_site_access_cards
   SET key_holder_engagement_id='d0e30000-0000-0000-0000-000000000004'
 WHERE id='bbbb2222-0000-4000-8000-00000000ab01';
ROLLBACK TO d;
\echo '--- BETA copies an ALPHA seat into its own authority grant''s copy_to ---'
SAVEPOINT e;
INSERT INTO public.project_party_authority (engagement_id, scope, copy_to)
VALUES ('bbbb2222-0000-4000-8000-00000000dd01','selections', ARRAY[(SELECT pp.id FROM public.project_parties pp JOIN public.projects pj ON pj.id=pp.project_id WHERE pj.studio_id='b0000000-0000-0000-0000-000000000001' LIMIT 1)]);
ROLLBACK TO e;
ROLLBACK;
