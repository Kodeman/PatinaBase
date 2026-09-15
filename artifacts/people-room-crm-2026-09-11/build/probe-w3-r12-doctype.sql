BEGIN;
SELECT id AS firm_id, organization_id FROM public.studio_contacts
 WHERE entity_kind='company' LIMIT 1 \gset

-- a lapsed, gating COI and its honest in-force renewal
INSERT INTO public.studio_compliance_documents
  (organization_id, holder_id, holder_type, doc_type, expires_on, blocks)
VALUES (:'organization_id', :'firm_id', 'company', 'coi_gl', CURRENT_DATE - 40, ARRAY['site_access']::text[])
RETURNING id AS root_id \gset

INSERT INTO public.studio_compliance_documents
  (organization_id, holder_id, holder_type, doc_type, expires_on, blocks)
VALUES (:'organization_id', :'firm_id', 'company', 'coi_gl', CURRENT_DATE + 300, ARRAY['site_access']::text[])
RETURNING id AS succ_id \gset

SELECT 'A. before supersede: ' || public.compliance_state(:'firm_id');

UPDATE public.studio_compliance_documents SET superseded_by = :'succ_id' WHERE id = :'root_id';
SELECT 'B. after honest supersede: ' || public.compliance_state(:'firm_id');

UPDATE public.studio_compliance_documents SET doc_type = 'w9' WHERE id = :'succ_id';
SELECT 'C. successor retyped w9 -> SQL word: ' || public.compliance_state(:'firm_id');

-- what the browser's retainedComplianceDocuments would keep: root has
-- superseded_by, successor in force, blocks superset -> root RETIRED (dropped)
SELECT 'D. root still has superseded_by=' || (superseded_by IS NOT NULL)::text
       || ', successor in force=' || (SELECT (expires_on >= CURRENT_DATE)::text FROM public.studio_compliance_documents WHERE id=:'succ_id')
       || ', successor blocks superset=' || (SELECT (ARRAY['site_access']::text[] <@ blocks)::text FROM public.studio_compliance_documents WHERE id=:'succ_id')
  FROM public.studio_compliance_documents WHERE id=:'root_id';
ROLLBACK;
