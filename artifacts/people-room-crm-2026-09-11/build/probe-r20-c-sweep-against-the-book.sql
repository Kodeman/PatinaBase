\set ON_ERROR_STOP on
BEGIN;
SELECT jobname, schedule, command, active FROM cron.job WHERE jobname='compliance-document-expiry-sweep';
\echo '=== sweep run 1 ==='
SELECT public.sweep_compliance_expiries();
\echo '=== sweep run 2 (idempotency) ==='
SELECT public.sweep_compliance_expiries();
\echo '=== notices written ==='
SELECT n.state, n.expires_on, d.doc_type, sc.full_name, sc.company_name, sc.entity_kind
  FROM public.studio_compliance_notices n
  JOIN public.studio_compliance_documents d ON d.id=n.document_id
  JOIN public.studio_contacts sc ON sc.id=d.holder_id ORDER BY n.expires_on;
\echo '=== who was told ==='
SELECT nl.user_id, om.role, nl.metadata->>'subject' AS subject, nl.metadata->>'message' AS message
  FROM public.notification_log nl
  LEFT JOIN public.organization_members om ON om.user_id=nl.user_id AND om.organization_id='b0000000-0000-0000-0000-000000000001'
 WHERE nl.type='compliance_document_expiry' ORDER BY nl.user_id;
\echo '=== job_runs ==='
SELECT job_name, status, detail FROM public.job_runs WHERE job_name='compliance-document-expiry-sweep' ORDER BY id;
\echo '=== total papers ==='
SELECT count(*) AS documents FROM public.studio_compliance_documents;
ROLLBACK;
