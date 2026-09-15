\set ON_ERROR_STOP on
\echo '=== B. sweep end-to-end, twice ==='
SELECT public.sweep_compliance_expiries() AS run1;
SELECT public.sweep_compliance_expiries() AS run2;
\echo '-- notices written --'
SELECT n.state, n.expires_on, d.doc_type, sc.company_name, sc.full_name
  FROM studio_compliance_notices n JOIN studio_compliance_documents d ON d.id=n.document_id
  JOIN studio_contacts sc ON sc.id=d.holder_id ORDER BY n.state, n.expires_on;
\echo '-- recipients by role --'
SELECT om.role, count(*) FROM notification_log nl JOIN organization_members om ON om.user_id=nl.user_id
 WHERE nl.type='compliance_document_expiry' GROUP BY 1 ORDER BY 1;
\echo '-- any recipient who is NOT an active owner/admin of the holding studio --'
SELECT count(*) AS bad_recipients FROM notification_log nl
 WHERE nl.type='compliance_document_expiry'
   AND NOT EXISTS (SELECT 1 FROM studio_compliance_documents d
                    JOIN organization_members om ON om.organization_id=d.organization_id
                   WHERE d.id=(nl.metadata->>'document_id')::uuid
                     AND om.user_id=nl.user_id AND om.status='active' AND om.role IN ('owner','admin'));
\echo '-- job_runs --'
SELECT status, detail FROM job_runs WHERE job_name='compliance-document-expiry-sweep' ORDER BY id;
\echo '-- document state census --'
SELECT public.compliance_document_state(id) st, count(*) FROM studio_compliance_documents GROUP BY 1 ORDER BY 1;
SELECT count(*) AS total_docs FROM studio_compliance_documents;
