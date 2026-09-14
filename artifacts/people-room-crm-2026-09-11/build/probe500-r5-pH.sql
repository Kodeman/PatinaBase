\pset pager off
BEGIN;
SET LOCAL search_path TO public;
\set ORG '''b0000000-0000-0000-0000-000000000001'''
\set OWNER '''a0000000-0000-0000-0000-000000000004'''
-- a sole proprietor and her one-woman firm, with a three-deep renewed COI chain on the FIRM
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, is_sole_proprietor, created_by, created_at)
VALUES ('44440000-0000-4000-8000-000000000001', :ORG::uuid,'person','subcontractor','Dana Kowalski', true, :OWNER::uuid, now()-interval '2 years');
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by)
VALUES ('44440000-0000-4000-8000-000000000002', :ORG::uuid,'company','subcontractor','Kowalski Tile', :OWNER::uuid);
INSERT INTO studio_person_affiliations (person_id, company_id) VALUES ('44440000-0000-4000-8000-000000000001','44440000-0000-4000-8000-000000000002');
-- oldest -> middle -> newest, edges written head-first
INSERT INTO studio_compliance_documents (id, organization_id, holder_id, holder_type, doc_type, expires_on, blocks)
VALUES ('44440000-0000-4000-8000-0000000000c3', :ORG::uuid,'44440000-0000-4000-8000-000000000002','company','coi_gl', CURRENT_DATE + 400, ARRAY['draw','site_access']),
       ('44440000-0000-4000-8000-0000000000c2', :ORG::uuid,'44440000-0000-4000-8000-000000000002','company','coi_gl', CURRENT_DATE + 30, ARRAY['draw','site_access']),
       ('44440000-0000-4000-8000-0000000000c1', :ORG::uuid,'44440000-0000-4000-8000-000000000002','company','coi_gl', CURRENT_DATE - 100, ARRAY['draw','site_access']);
UPDATE studio_compliance_documents SET superseded_by='44440000-0000-4000-8000-0000000000c2' WHERE id='44440000-0000-4000-8000-0000000000c1';
UPDATE studio_compliance_documents SET superseded_by='44440000-0000-4000-8000-0000000000c3' WHERE id='44440000-0000-4000-8000-0000000000c2';
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
DO $$ BEGIN PERFORM public.merge_studio_contacts('44440000-0000-4000-8000-000000000001','44440000-0000-4000-8000-000000000002','company_name');
 RAISE NOTICE 'M-1 cross-kind fold: MERGE OK'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'M-1 FAILED: %', SQLERRM; END $$;
RESET role;
SELECT 'M-1 docs after' AS probe, id::text, holder_id::text, holder_type, superseded_by::text FROM studio_compliance_documents
 WHERE id IN ('44440000-0000-4000-8000-0000000000c1','44440000-0000-4000-8000-0000000000c2','44440000-0000-4000-8000-0000000000c3') ORDER BY id;
SELECT 'M-1 affiliations left' AS probe, count(*) FROM studio_person_affiliations WHERE company_id='44440000-0000-4000-8000-000000000002';
SELECT 'M-1 person company_id' AS probe, COALESCE(company_id::text,'(null)') FROM studio_contacts WHERE id='44440000-0000-4000-8000-000000000001';
SELECT 'M-1 paper word' AS probe, public.identity_paper_state('44440000-0000-4000-8000-000000000001', NULL);
ROLLBACK;
