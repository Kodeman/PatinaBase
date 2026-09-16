BEGIN;
INSERT INTO public.organizations (id,type,name,slug,status) VALUES
 ('fe000000-0000-4000-8000-00000000000a','design_studio','Probe E','probe-e','active');
INSERT INTO public.organization_members (user_id,organization_id,role,status,joined_at) VALUES
 ('a0000000-0000-0000-0000-000000000004','fe000000-0000-4000-8000-00000000000a','owner','active',now())
ON CONFLICT (user_id,organization_id) DO UPDATE SET role='owner', status='active';
INSERT INTO public.studio_contacts (id,organization_id,entity_kind,contact_kind,company_name,company_kind,created_by) VALUES
 ('fe200000-0000-4000-8000-00000000000a','fe000000-0000-4000-8000-00000000000a','company','sub','Survivor Co','sub','a0000000-0000-0000-0000-000000000004'),
 ('fe200000-0000-4000-8000-00000000000b','fe000000-0000-4000-8000-00000000000a','company','sub','Absorbed Co','sub','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.studio_compliance_documents (id,organization_id,holder_type,holder_id,doc_type,blocks,issued_on,expires_on) VALUES
 ('fe400000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-00000000000a','company','fe200000-0000-4000-8000-00000000000a','coi_gl',ARRAY['site_access','payment','draw']::text[],'2026-01-01', CURRENT_DATE+300),
 ('fe400000-0000-4000-8000-00000000000c','fe000000-0000-4000-8000-00000000000a','company','fe200000-0000-4000-8000-00000000000b','coi_gl',ARRAY['site_access','payment','draw']::text[],'2024-01-01','2025-01-01'),
 ('fe400000-0000-4000-8000-00000000000d','fe000000-0000-4000-8000-00000000000a','company','fe200000-0000-4000-8000-00000000000b','coi_gl',ARRAY['site_access','payment','draw']::text[],'2025-01-01', CURRENT_DATE+200);
UPDATE public.studio_compliance_documents SET superseded_by='fe400000-0000-4000-8000-00000000000d' WHERE id='fe400000-0000-4000-8000-00000000000c';
-- absorbed also holds an orphan LAPSED w9-with-gate that nothing retires
INSERT INTO public.studio_compliance_documents (id,organization_id,holder_type,holder_id,doc_type,blocks,issued_on,expires_on) VALUES
 ('fe400000-0000-4000-8000-00000000000e','fe000000-0000-4000-8000-00000000000a','company','fe200000-0000-4000-8000-00000000000b','bond',ARRAY['payment']::text[],'2024-01-01','2025-06-01');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
SELECT public.merge_studio_contacts('fe200000-0000-4000-8000-00000000000a','fe200000-0000-4000-8000-00000000000b','company_name');
RESET ROLE;
SELECT 'docs left on absorbed' AS w, count(*) FROM public.studio_compliance_documents WHERE holder_id='fe200000-0000-4000-8000-00000000000b';
SELECT id, holder_id, superseded_by, expires_on, public.compliance_document_state(id) AS state
  FROM public.studio_compliance_documents WHERE organization_id='fe000000-0000-4000-8000-00000000000a' ORDER BY id;
SELECT 'survivor paper word' AS w, public.compliance_state('fe200000-0000-4000-8000-00000000000a');
ROLLBACK;
