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

-- ── a wholly separate tenant: Studio BETA, its own owner, project, seat, card
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, created_at, updated_at)
VALUES ('bbbb2222-0000-4000-8000-00000000b001','00000000-0000-0000-0000-000000000000','beta-owner@example.test','x',now(),'authenticated','authenticated',now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, full_name, is_designer) VALUES
  ('bbbb2222-0000-4000-8000-00000000b001','beta-owner@example.test','Beta Owner', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('bbbb2222-0000-4000-8000-00000000ac01','design_studio','Studio Beta','studio-beta-probe','active') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('bbbb2222-0000-4000-8000-00000000b001','bbbb2222-0000-4000-8000-00000000ac01','owner','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET status='active';
INSERT INTO public.projects (id, name, designer_id, studio_id, status, created_by)
VALUES ('bbbb2222-0000-4000-8000-00000000aa01','Beta remodel','bbbb2222-0000-4000-8000-00000000b001','bbbb2222-0000-4000-8000-00000000ac01','active','bbbb2222-0000-4000-8000-00000000b001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, company_name)
VALUES ('bbbb2222-0000-4000-8000-00000000cc01','bbbb2222-0000-4000-8000-00000000ac01','company','sub','Beta Electric')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164)
VALUES ('bbbb2222-0000-4000-8000-00000000cc02','bbbb2222-0000-4000-8000-00000000ac01','person','sub','Beta Person','+16125550001','+16125550001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, phone_e164, stage, on_site_from, on_site_to, company_id)
VALUES ('bbbb2222-0000-4000-8000-00000000dd01','bbbb2222-0000-4000-8000-00000000aa01','sub','Beta Seat','+16125550001','+16125550001','active',CURRENT_DATE,CURRENT_DATE+120,'bbbb2222-0000-4000-8000-00000000cc01')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.studio_compliance_documents (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('bbbb2222-0000-4000-8000-00000000ee01','bbbb2222-0000-4000-8000-00000000ac01','company','bbbb2222-0000-4000-8000-00000000cc01','coi_gl',CURRENT_DATE-5,ARRAY['site_access'])
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.project_party_authority (id, engagement_id, scope, threshold_cents)
VALUES ('bbbb2222-0000-4000-8000-00000000ff01','bbbb2222-0000-4000-8000-00000000dd01','money',999900) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.project_site_access_cards (id, project_id, lockbox_version, key_holder_engagement_id)
VALUES ('bbbb2222-0000-4000-8000-00000000ab01','bbbb2222-0000-4000-8000-00000000aa01','beta v3','bbbb2222-0000-4000-8000-00000000dd01')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.studio_channel_consent (organization_id, channel_kind, channel_value, status, source, recorded_at, opt_out_at)
VALUES ('bbbb2222-0000-4000-8000-00000000ac01','sms','+16125550001','opted_out','other',now(),now())
ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE SET status='opted_out';

\echo ''
\echo '=== A. ALPHA (designer@patina.dev, the seeded studio) reads BETA rows? ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
SELECT 'studio_compliance_documents' AS relation, count(*) AS beta_rows_visible FROM public.studio_compliance_documents WHERE organization_id='bbbb2222-0000-4000-8000-00000000ac01'
UNION ALL SELECT 'project_party_authority', count(*) FROM public.project_party_authority WHERE engagement_id='bbbb2222-0000-4000-8000-00000000dd01'
UNION ALL SELECT 'project_site_access_cards', count(*) FROM public.project_site_access_cards WHERE project_id='bbbb2222-0000-4000-8000-00000000aa01'
UNION ALL SELECT 'people_directory (beta names)', count(*) FROM public.people_directory WHERE display_name IN ('Beta Electric','Beta Person','Beta Seat')
UNION ALL SELECT 'people_directory_seats (beta seat)', count(*) FROM public.people_directory_seats WHERE seat_id='bbbb2222-0000-4000-8000-00000000dd01'
UNION ALL SELECT 'v_access_grants (beta project scope)', count(*) FROM public.v_access_grants WHERE scope_id IN ('bbbb2222-0000-4000-8000-00000000aa01','bbbb2222-0000-4000-8000-00000000ac01');
\echo '    ALPHA calling the new functions on BETA ids:'
SELECT public.compliance_state('bbbb2222-0000-4000-8000-00000000cc01') AS beta_firm_paper_word,
       public.identity_seat_count('bbbb2222-0000-4000-8000-00000000cc01') AS beta_seat_count,
       public.contact_rule_summary('company','bbbb2222-0000-4000-8000-00000000cc01') AS beta_rule,
       public.reach_state_for(NULL,'bbbb2222-0000-4000-8000-00000000cc01',NULL) AS beta_reach,
       public.project_designer('bbbb2222-0000-4000-8000-00000000aa01') AS beta_designer_oracle,
       public.project_party_org('bbbb2222-0000-4000-8000-00000000dd01') AS beta_org_oracle;
\echo '    ALPHA writing into BETA:'
SAVEPOINT s1;
INSERT INTO public.studio_compliance_documents (organization_id, holder_type, holder_id, doc_type)
VALUES ('bbbb2222-0000-4000-8000-00000000ac01','company','bbbb2222-0000-4000-8000-00000000cc01','w9');
ROLLBACK TO s1;
SAVEPOINT s2;
UPDATE public.project_site_access_cards SET lockbox_version='pwned' WHERE project_id='bbbb2222-0000-4000-8000-00000000aa01';
ROLLBACK TO s2;
SAVEPOINT s3;
INSERT INTO public.project_party_authority (engagement_id, scope) VALUES ('bbbb2222-0000-4000-8000-00000000dd01','selections');
ROLLBACK TO s3;

\echo ''
\echo '=== B. BETA reads ALPHA rows? ==='
SELECT pg_temp.reset_role();
SELECT pg_temp.assume_user('bbbb2222-0000-4000-8000-00000000b001');
SELECT 'studio_compliance_documents' AS relation, count(*) AS alpha_rows_visible FROM public.studio_compliance_documents WHERE organization_id='b0000000-0000-0000-0000-000000000001'
UNION ALL SELECT 'project_party_authority (alpha)', count(*) FROM public.project_party_authority a WHERE EXISTS (SELECT 1 FROM public.project_parties pp JOIN public.projects pj ON pj.id=pp.project_id WHERE pp.id=a.engagement_id AND pj.studio_id='b0000000-0000-0000-0000-000000000001')
UNION ALL SELECT 'project_site_access_cards (alpha)', count(*) FROM public.project_site_access_cards c WHERE EXISTS (SELECT 1 FROM public.projects pj WHERE pj.id=c.project_id AND pj.studio_id='b0000000-0000-0000-0000-000000000001')
UNION ALL SELECT 'people_directory (alpha names)', count(*) FROM public.people_directory WHERE display_name IN ('Dana Kowalski','Northgate Electric','Ngozi Eze')
UNION ALL SELECT 'people_directory_seats (alpha)', count(*) FROM public.people_directory_seats WHERE display_name IN ('Dana Kowalski','Ngozi Eze');
SELECT public.compliance_state((SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric')) AS alpha_firm_word_seen_by_beta;
\echo '    and the cross-tenant guards on the new pointers:'
SAVEPOINT s4;
UPDATE public.project_parties SET company_id=(SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric')
 WHERE id='bbbb2222-0000-4000-8000-00000000dd01';
ROLLBACK TO s4;
SAVEPOINT s5;
INSERT INTO public.studio_compliance_documents (organization_id, holder_type, holder_id, doc_type)
VALUES ('bbbb2222-0000-4000-8000-00000000ac01','company',(SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric'),'w9');
ROLLBACK TO s5;
SELECT pg_temp.reset_role();
ROLLBACK;
