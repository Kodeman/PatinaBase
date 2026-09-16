-- PROBE B: the sole-proprietor fold and the CREW's paper word.
BEGIN;
INSERT INTO public.organizations (id,type,name,slug,status) VALUES
 ('fb000000-0000-4000-8000-00000000000a','design_studio','Probe Studio B','probe-studio-b','active');
INSERT INTO public.organization_members (user_id,organization_id,role,status,joined_at) VALUES
 ('a0000000-0000-0000-0000-000000000004','fb000000-0000-4000-8000-00000000000a','owner','active',now())
ON CONFLICT (user_id,organization_id) DO UPDATE SET role='owner', status='active';

-- the sole proprietor (survivor) and his firm (merged away)
INSERT INTO public.studio_contacts (id,organization_id,entity_kind,contact_kind,full_name,created_by,is_sole_proprietor) VALUES
 ('fb100000-0000-4000-8000-00000000000a','fb000000-0000-4000-8000-00000000000a','person','sub','Dana Soleprop','a0000000-0000-0000-0000-000000000004', true),
 ('fb100000-0000-4000-8000-00000000000b','fb000000-0000-4000-8000-00000000000a','person','sub','Joe Crew','a0000000-0000-0000-0000-000000000004', false);
INSERT INTO public.studio_contacts (id,organization_id,entity_kind,contact_kind,company_name,company_kind,created_by) VALUES
 ('fb200000-0000-4000-8000-00000000000a','fb000000-0000-4000-8000-00000000000a','company','sub','Northgate Probe Electric','sub','a0000000-0000-0000-0000-000000000004');

-- both affiliated with the firm
INSERT INTO public.studio_person_affiliations (person_id, company_id, role_at_firm, from_date) VALUES
 ('fb100000-0000-4000-8000-00000000000a','fb200000-0000-4000-8000-00000000000a','owner','2021-01-01'),
 ('fb100000-0000-4000-8000-00000000000b','fb200000-0000-4000-8000-00000000000a','Foreman','2021-01-01');

-- the firm's LAPSED general-liability certificate, gating site access
INSERT INTO public.studio_compliance_documents
 (id,organization_id,holder_type,holder_id,doc_type,blocks,issued_on,expires_on) VALUES
 ('fb400000-0000-4000-8000-00000000000a','fb000000-0000-4000-8000-00000000000a','company',
  'fb200000-0000-4000-8000-00000000000a','coi_gl', ARRAY['site_access','payment','draw']::text[],
  '2024-01-01','2026-03-31');

SELECT 'BEFORE' AS when_,
       sc.full_name,
       sc.company_id,
       public.identity_paper_state(sc.id, sc.company_id) AS paper_word
  FROM public.studio_contacts sc
 WHERE sc.id IN ('fb100000-0000-4000-8000-00000000000a','fb100000-0000-4000-8000-00000000000b')
 ORDER BY sc.full_name;

-- the fold, as a member of the studio
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
SELECT public.merge_studio_contacts(
  'fb100000-0000-4000-8000-00000000000a',
  'fb200000-0000-4000-8000-00000000000a',
  'manual') AS survivor;
RESET ROLE;

SELECT 'AFTER' AS when_,
       sc.full_name,
       sc.company_id,
       public.identity_paper_state(sc.id, sc.company_id) AS paper_word
  FROM public.studio_contacts sc
 WHERE sc.id IN ('fb100000-0000-4000-8000-00000000000a','fb100000-0000-4000-8000-00000000000b')
 ORDER BY sc.full_name;

SELECT 'docs left on folded firm' AS what, count(*) FROM public.studio_compliance_documents
 WHERE holder_id='fb200000-0000-4000-8000-00000000000a';
SELECT 'crew affiliation' AS what, person_id, company_id, role_at_firm, to_date
  FROM public.studio_person_affiliations WHERE person_id='fb100000-0000-4000-8000-00000000000b';
ROLLBACK;
