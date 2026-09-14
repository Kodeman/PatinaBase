\pset pager off
BEGIN;
SET LOCAL search_path TO public;
\set ORG '''b0000000-0000-0000-0000-000000000001'''
\set OWNER '''a0000000-0000-0000-0000-000000000004'''

-- survivor: an OLDER firm card with nothing typed on it
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by, created_at)
VALUES ('eeee0000-0000-4000-8000-00000000e001', :ORG::uuid,'company','subcontractor','Ostrom Builders', :OWNER::uuid, now() - interval '2 years');
-- duplicate: the NEWER card the studio actually worked off
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by, created_at,
  studio_verdict, studio_verdict_at, remit_to, retainage_bps, legal_name, dba_name, w9_on_file_at,
  tax_id_last4, trades, specialties, notes, warranty_until, company_kind)
VALUES ('eeee0000-0000-4000-8000-00000000e002', :ORG::uuid,'company','subcontractor','Ostrom Builders LLC', :OWNER::uuid, now() - interval '3 months',
  'Good crew. Slow to send paper.', now(), 'Ostrom Builders LLC, PO Box 44, Minneapolis MN', 1000,
  'Ostrom Builders LLC','Ostrom', CURRENT_DATE - 30, '4417', ARRAY['framing'], ARRAY['millwork'],
  'Ask for Pete, not the office.', CURRENT_DATE + 365, 'sub');

SELECT 'PRE-survivor' AS probe, studio_verdict, remit_to, retainage_bps, legal_name, dba_name, w9_on_file_at, tax_id_last4, trades, specialties, notes, warranty_until, company_kind
  FROM studio_contacts WHERE id='eeee0000-0000-4000-8000-00000000e001';
SELECT 'PRE-duplicate' AS probe, studio_verdict, remit_to, retainage_bps, legal_name, dba_name, w9_on_file_at, tax_id_last4, trades, specialties, notes, warranty_until, company_kind
  FROM studio_contacts WHERE id='eeee0000-0000-4000-8000-00000000e002';

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
-- PR-o pre-picks the OLDER card as survivor: e001
SELECT 'MERGE (older survives, PR-o default)' AS probe,
       public.merge_studio_contacts('eeee0000-0000-4000-8000-00000000e001','eeee0000-0000-4000-8000-00000000e002','company_name')::text;
RESET role;

SELECT 'POST-survivor' AS probe, studio_verdict, remit_to, retainage_bps, legal_name, dba_name, w9_on_file_at, tax_id_last4, trades, specialties, notes, warranty_until, company_kind
  FROM studio_contacts WHERE id='eeee0000-0000-4000-8000-00000000e001';

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
SELECT 'DIRECTORY rows for this firm' AS probe, person_id::text, display_name FROM people_directory
 WHERE person_id IN ('eeee0000-0000-4000-8000-00000000e001','eeee0000-0000-4000-8000-00000000e002');
ROLLBACK;
