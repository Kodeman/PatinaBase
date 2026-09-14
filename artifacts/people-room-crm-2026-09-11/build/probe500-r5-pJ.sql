\pset pager off
BEGIN;
SET LOCAL search_path TO public;
\set ORG '''b0000000-0000-0000-0000-000000000001'''
\set OWNER '''a0000000-0000-0000-0000-000000000004'''
-- an ARCHIVED firm with a lapsing COI
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by, archived_at)
VALUES ('66660000-0000-4000-8000-000000000001', :ORG::uuid,'company','subcontractor','Retired Firm', :OWNER::uuid, now());
INSERT INTO studio_compliance_documents (id, organization_id, holder_id, holder_type, doc_type, expires_on, blocks)
VALUES ('66660000-0000-4000-8000-0000000000d1', :ORG::uuid,'66660000-0000-4000-8000-000000000001','company','coi_gl', CURRENT_DATE + 5, ARRAY['draw']);
DELETE FROM studio_compliance_notices;
SELECT 'sweep with an archived holder' AS probe, public.sweep_compliance_expiries();
SELECT 'notice for the archived firm' AS probe, count(*) FROM studio_compliance_notices WHERE document_id='66660000-0000-4000-8000-0000000000d1';
SELECT 'notification subject' AS probe, metadata->>'subject', metadata->>'deep_link'
  FROM notification_log WHERE type='compliance_document_expiry' AND metadata->>'document_id'='66660000-0000-4000-8000-0000000000d1' LIMIT 1;

-- the notice table never forgets: a corrected date is never re-announced
UPDATE studio_compliance_documents SET expires_on = CURRENT_DATE + 400 WHERE id='66660000-0000-4000-8000-0000000000d1';
SELECT 'state after correction' AS probe, public.compliance_document_state('66660000-0000-4000-8000-0000000000d1');
UPDATE studio_compliance_documents SET expires_on = CURRENT_DATE + 5 WHERE id='66660000-0000-4000-8000-0000000000d1';
SELECT 'state back in the window' AS probe, public.compliance_document_state('66660000-0000-4000-8000-0000000000d1');
SELECT 'sweep again' AS probe, public.sweep_compliance_expiries();
SELECT 'notices for that doc now' AS probe, state, count(*) FROM studio_compliance_notices WHERE document_id='66660000-0000-4000-8000-0000000000d1' GROUP BY 1;
ROLLBACK;
