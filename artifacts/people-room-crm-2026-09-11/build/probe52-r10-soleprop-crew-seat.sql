-- PROBE C: the crew member's SEAT after a sole-proprietor fold.
BEGIN;
INSERT INTO public.organizations (id,type,name,slug,status) VALUES
 ('fc000000-0000-4000-8000-00000000000a','design_studio','Probe Studio C','probe-studio-c','active');
INSERT INTO public.organization_members (user_id,organization_id,role,status,joined_at) VALUES
 ('a0000000-0000-0000-0000-000000000004','fc000000-0000-4000-8000-00000000000a','owner','active',now())
ON CONFLICT (user_id,organization_id) DO UPDATE SET role='owner', status='active';

INSERT INTO public.studio_contacts (id,organization_id,entity_kind,contact_kind,full_name,created_by,is_sole_proprietor) VALUES
 ('fc100000-0000-4000-8000-00000000000a','fc000000-0000-4000-8000-00000000000a','person','sub','Dana Soleprop','a0000000-0000-0000-0000-000000000004', true),
 ('fc100000-0000-4000-8000-00000000000b','fc000000-0000-4000-8000-00000000000a','person','sub','Joe Crew','a0000000-0000-0000-0000-000000000004', false);
INSERT INTO public.studio_contacts (id,organization_id,entity_kind,contact_kind,company_name,company_kind,created_by) VALUES
 ('fc200000-0000-4000-8000-00000000000a','fc000000-0000-4000-8000-00000000000a','company','sub','Northgate Probe Electric','sub','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.studio_person_affiliations (person_id, company_id, role_at_firm, from_date) VALUES
 ('fc100000-0000-4000-8000-00000000000a','fc200000-0000-4000-8000-00000000000a','owner','2021-01-01'),
 ('fc100000-0000-4000-8000-00000000000b','fc200000-0000-4000-8000-00000000000a','Foreman','2021-01-01');
INSERT INTO public.studio_compliance_documents
 (id,organization_id,holder_type,holder_id,doc_type,blocks,issued_on,expires_on) VALUES
 ('fc400000-0000-4000-8000-00000000000a','fc000000-0000-4000-8000-00000000000a','company',
  'fc200000-0000-4000-8000-00000000000a','coi_gl', ARRAY['site_access','payment','draw']::text[],
  '2024-01-01','2026-03-31');

INSERT INTO public.projects (id,name,designer_id,studio_id,status,created_by,client_visibility_tier) VALUES
 ('fc300000-0000-4000-8000-00000000000a','Probe C job','a0000000-0000-0000-0000-000000000004','fc000000-0000-4000-8000-00000000000a','active','a0000000-0000-0000-0000-000000000004','full');
INSERT INTO public.project_parties (id,project_id,party_kind,display_name,studio_contact_id,company_id,company_name,stage,created_by) VALUES
 ('fc500000-0000-4000-8000-00000000000a','fc300000-0000-4000-8000-00000000000a','sub','Joe Crew',
  'fc100000-0000-4000-8000-00000000000b','fc200000-0000-4000-8000-00000000000a','Northgate Probe Electric','active','a0000000-0000-0000-0000-000000000004');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
SELECT 'BEFORE seat' AS w, person_id, display_name, paper_state, company_name
  FROM public.people_directory_seats WHERE seat_id='fc500000-0000-4000-8000-00000000000a';
SELECT 'BEFORE directory' AS w, display_name, paper_state, meta->>'company_name' AS firm
  FROM public.people_directory WHERE person_id='fc100000-0000-4000-8000-00000000000b';
SELECT public.merge_studio_contacts('fc100000-0000-4000-8000-00000000000a','fc200000-0000-4000-8000-00000000000a','manual');
SELECT 'AFTER seat' AS w, person_id, display_name, paper_state, company_name
  FROM public.people_directory_seats WHERE seat_id='fc500000-0000-4000-8000-00000000000a';
SELECT 'AFTER directory' AS w, display_name, paper_state, meta->>'company_name' AS firm
  FROM public.people_directory WHERE person_id='fc100000-0000-4000-8000-00000000000b';
RESET ROLE;
SELECT 'seat company_id after' AS w, company_id, company_name FROM public.project_parties WHERE id='fc500000-0000-4000-8000-00000000000a';
ROLLBACK;
