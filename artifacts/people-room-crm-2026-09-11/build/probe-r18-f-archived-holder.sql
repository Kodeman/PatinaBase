\set ON_ERROR_STOP on
BEGIN;
-- clear the ledger so the sweep speaks again
DELETE FROM public.studio_compliance_notices;
DELETE FROM public.notification_log WHERE type='compliance_document_expiry';
-- put Northgate Electric's card AWAY
UPDATE public.studio_contacts SET archived_at = now() WHERE id='d0e20000-0000-0000-0000-000000000003';
SELECT public.sweep_compliance_expiries() AS run;
\echo '--- does the sweep still announce a card the studio put away? ---'
SELECT nl.metadata->>'subject' AS subject, nl.metadata->>'deep_link' AS link
  FROM public.notification_log nl
 WHERE nl.type='compliance_document_expiry'
   AND nl.metadata->>'holder_id' = 'd0e20000-0000-0000-0000-000000000003'
 LIMIT 2;
ROLLBACK;
