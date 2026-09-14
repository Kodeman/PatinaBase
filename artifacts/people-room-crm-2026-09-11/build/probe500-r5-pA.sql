\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path TO public;
-- org = Local Dev Studio, owner designer@patina.dev
\set ORG '''b0000000-0000-0000-0000-000000000001'''
\set OWNER '''a0000000-0000-0000-0000-000000000004'''

-- two person cards, survivor ARCHIVED
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, email, created_by, archived_at)
VALUES ('aaaa0000-0000-4000-8000-00000000a001', :ORG::uuid, 'person','subcontractor','Arch Survivor','arch.surv@example.invalid', :OWNER::uuid, now()),
       ('aaaa0000-0000-4000-8000-00000000a002', :ORG::uuid, 'person','subcontractor','Live Dup','live.dup@example.invalid', :OWNER::uuid, NULL);

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);

SELECT 'A1 merge into ARCHIVED survivor =>' AS probe,
       public.merge_studio_contacts('aaaa0000-0000-4000-8000-00000000a001','aaaa0000-0000-4000-8000-00000000a002','manual')::text AS result;

RESET role;
SELECT 'A2 survivor archived_at' AS probe, (archived_at IS NOT NULL) AS archived, merged_into IS NULL AS live
  FROM studio_contacts WHERE id='aaaa0000-0000-4000-8000-00000000a001';

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
SELECT 'A3 directory rows for the pair' AS probe, person_id::text, display_name, status_raw
  FROM people_directory
 WHERE person_id IN ('aaaa0000-0000-4000-8000-00000000a001','aaaa0000-0000-4000-8000-00000000a002');
ROLLBACK;
