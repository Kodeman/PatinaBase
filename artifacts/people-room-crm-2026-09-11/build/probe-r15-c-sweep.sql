BEGIN;
SELECT 'C-a sweep -> ' || public.sweep_compliance_expiries()::text;
SELECT 'C-b notice: ' || n.state || ' ' || n.expires_on::text || ' doc=' || n.document_id::text
  FROM studio_compliance_notices n ORDER BY n.expires_on;
SELECT 'C-c notification subject: ' || (metadata->>'subject') || ' | ' || (metadata->>'message')
  FROM notification_log WHERE type='compliance_document_expiry' ORDER BY 1;
SELECT 'C-d recipients by role: ' || om.role || ' x' || count(*)::text
  FROM notification_log nl JOIN organization_members om ON om.user_id = nl.user_id
 WHERE nl.type='compliance_document_expiry' AND om.status='active'
 GROUP BY om.role;
SELECT 'C-e second run (idempotency) -> ' || public.sweep_compliance_expiries()::text;
ROLLBACK;
