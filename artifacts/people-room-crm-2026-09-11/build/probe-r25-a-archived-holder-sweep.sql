\pset pager off
BEGIN;
SELECT public.sweep_compliance_expiries() AS first_run;
SELECT n.state, n.expires_on, m.metadata->>'subject' AS subject, m.metadata->>'message' AS message
  FROM studio_compliance_notices n
  JOIN notification_log m ON (m.metadata->>'document_id')::uuid = n.document_id
 GROUP BY 1,2,3,4 ORDER BY 1,2;
-- n4: archive a gating holder, clear its notices, re-sweep
UPDATE studio_contacts SET archived_at = now() WHERE id = (
  SELECT holder_id FROM studio_compliance_documents WHERE id IN (SELECT document_id FROM studio_compliance_notices) LIMIT 1);
DELETE FROM studio_compliance_notices;
DELETE FROM notification_log WHERE type='compliance_document_expiry';
SELECT public.sweep_compliance_expiries() AS after_archiving_a_holder;
SELECT count(*) AS notices_for_archived_holder
  FROM studio_compliance_notices n
  JOIN studio_compliance_documents d ON d.id=n.document_id
  JOIN studio_contacts sc ON sc.id=d.holder_id
 WHERE sc.archived_at IS NOT NULL;
ROLLBACK;
