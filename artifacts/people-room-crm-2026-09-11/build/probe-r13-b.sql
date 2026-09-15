BEGIN;
SELECT public.sweep_compliance_expiries() AS run1 \gset
SELECT :'run1' AS run1;
SELECT public.sweep_compliance_expiries() AS run2 \gset
SELECT :'run2' AS run2;
-- recipients
SELECT om.role, count(*) AS notifications
FROM public.notification_log nl
JOIN public.organization_members om ON om.user_id = nl.user_id
WHERE nl.type='compliance_document_expiry'
  AND om.organization_id = (nl.metadata->>'holder_id')::uuid IS NOT NULL
GROUP BY 1;
SELECT DISTINCT om.role
FROM public.notification_log nl
JOIN public.studio_compliance_documents d ON d.id = (nl.metadata->>'document_id')::uuid
JOIN public.organization_members om ON om.user_id = nl.user_id AND om.organization_id = d.organization_id
WHERE nl.type='compliance_document_expiry';
-- do any notices name an ARCHIVED card?
SELECT sc.full_name, sc.company_name, sc.archived_at, n.state, n.expires_on
FROM public.studio_compliance_notices n
JOIN public.studio_compliance_documents d ON d.id = n.document_id
JOIN public.studio_contacts sc ON sc.id = d.holder_id
WHERE sc.archived_at IS NOT NULL;
-- the full paper census (m4 check)
SELECT public.compliance_document_state(d.id) AS state, count(*)
FROM public.studio_compliance_documents d GROUP BY 1 ORDER BY 1;
SELECT count(*) AS total_papers FROM public.studio_compliance_documents;
ROLLBACK;
