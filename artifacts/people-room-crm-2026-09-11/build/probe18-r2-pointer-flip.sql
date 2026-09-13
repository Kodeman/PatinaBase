BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('a3000000-0000-4000-8000-000000000001','rv3@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at)
VALUES ('a3000000-0000-4000-8000-000000000001','rv3@test.invalid','Owner',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at)
VALUES ('b3000000-0000-4000-8000-00000000000a','design_studio','RV3','rv3','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at)
VALUES ('a3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO studio_contacts (id,organization_id,entity_kind,contact_kind,full_name,company_name,created_by) VALUES
 ('c3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-00000000000a','person','sub','Dana',NULL,'a3000000-0000-4000-8000-000000000001'),
 ('c3000000-0000-4000-8000-00000000000A','b3000000-0000-4000-8000-00000000000a','company','sub',NULL,'Firm A (old)','a3000000-0000-4000-8000-000000000001'),
 ('c3000000-0000-4000-8000-00000000000B','b3000000-0000-4000-8000-00000000000a','company','sub',NULL,'Firm B (new)','a3000000-0000-4000-8000-000000000001'),
 ('c3000000-0000-4000-8000-00000000000C','b3000000-0000-4000-8000-00000000000a','company','sub',NULL,'Firm C','a3000000-0000-4000-8000-000000000001');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Two OPEN affiliations: A (2020) and B (2024). The pointer derives to B.
INSERT INTO studio_person_affiliations (person_id,company_id,from_date) VALUES
 ('c3000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-00000000000A',DATE '2020-01-01'),
 ('c3000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-00000000000B',DATE '2024-01-01');
\echo '--- pointer after the two affiliations (expect Firm B) ---'
SELECT c.company_name FROM studio_contacts p JOIN studio_contacts c ON c.id=p.company_id WHERE p.id='c3000000-0000-4000-8000-000000000001';

-- The designer picks Firm A in the shipped card editor (a direct company_id write).
UPDATE studio_contacts SET company_id='c3000000-0000-4000-8000-00000000000A' WHERE id='c3000000-0000-4000-8000-000000000001';
\echo '--- pointer right after the designer saves (expect Firm A) ---'
SELECT c.company_name FROM studio_contacts p JOIN studio_contacts c ON c.id=p.company_id WHERE p.id='c3000000-0000-4000-8000-000000000001';

-- Any later affiliation write for this person re-derives the pointer.
INSERT INTO studio_person_affiliations (person_id,company_id,from_date)
VALUES ('c3000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-00000000000C',DATE '2019-01-01');
\echo '--- pointer after an UNRELATED affiliation write (designer choice survived?) ---'
SELECT c.company_name FROM studio_contacts p JOIN studio_contacts c ON c.id=p.company_id WHERE p.id='c3000000-0000-4000-8000-000000000001';
RESET ROLE;
ROLLBACK;
