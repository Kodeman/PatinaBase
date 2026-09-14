\pset pager off
BEGIN;
SET LOCAL search_path TO public;
\set ORG '''b0000000-0000-0000-0000-000000000001'''
\set OWNER '''a0000000-0000-0000-0000-000000000004'''
\set PROF '''a0000000-0000-0000-0000-000000000005'''

-- B-1: the login and address travel
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, created_by, created_at)
VALUES ('11110000-0000-4000-8000-000000000001', :ORG::uuid,'person','client','Chidi Old', :OWNER::uuid, now()-interval '2 years');
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, email, profile_id, created_by)
VALUES ('11110000-0000-4000-8000-000000000002', :ORG::uuid,'person','client','Chidi New','chidi@example.invalid', :PROF::uuid, :OWNER::uuid);
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
SELECT 'B-1 pre reach' AS probe, reach_state, email FROM people_directory WHERE person_id='11110000-0000-4000-8000-000000000002';
SELECT 'B-1 merge' AS probe, public.merge_studio_contacts('11110000-0000-4000-8000-000000000001','11110000-0000-4000-8000-000000000002','profile')::text;
SELECT 'B-1 post' AS probe, person_id::text, display_name, reach_state, email FROM people_directory
 WHERE person_id IN ('11110000-0000-4000-8000-000000000001','11110000-0000-4000-8000-000000000002');
RESET role;

-- B-1 negative control: two DIFFERENT logins refuse
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, profile_id, created_by)
VALUES ('11110000-0000-4000-8000-000000000003', :ORG::uuid,'person','client','Two A', :OWNER::uuid, :OWNER::uuid),
       ('11110000-0000-4000-8000-000000000004', :ORG::uuid,'person','client','Two B','a0000000-0000-0000-0000-000000000003', :OWNER::uuid);
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
DO $$ BEGIN PERFORM public.merge_studio_contacts('11110000-0000-4000-8000-000000000003','11110000-0000-4000-8000-000000000004','profile');
 RAISE NOTICE 'B-1 control: MERGED (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B-1 control refused: %', SQLERRM; END $$;
RESET role;

-- B-2: a blocking rule left behind is refused
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, created_by, created_at)
VALUES ('22220000-0000-4000-8000-000000000001', :ORG::uuid,'person','subcontractor','Rule Surv', :OWNER::uuid, now()-interval '2 years'),
       ('22220000-0000-4000-8000-000000000002', :ORG::uuid,'person','subcontractor','Rule Dup', :OWNER::uuid, now());
INSERT INTO studio_contact_rules (subject_type, subject_id, channels_forbidden, set_by)
VALUES ('person','22220000-0000-4000-8000-000000000001', ARRAY['dispatch'], :OWNER::uuid),
       ('person','22220000-0000-4000-8000-000000000002', ARRAY['sms','mobile','office','email'], :OWNER::uuid);
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
DO $$ BEGIN PERFORM public.merge_studio_contacts('22220000-0000-4000-8000-000000000001','22220000-0000-4000-8000-000000000002','phone');
 RAISE NOTICE 'B-2: MERGED (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B-2 refused: %', SQLERRM; END $$;
RESET role;

-- B-2 residual: a NON-blocking rule (never text) left behind, merge proceeds
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, created_by, created_at)
VALUES ('33330000-0000-4000-8000-000000000001', :ORG::uuid,'person','subcontractor','Ray Surv', :OWNER::uuid, now()-interval '2 years'),
       ('33330000-0000-4000-8000-000000000002', :ORG::uuid,'person','subcontractor','Ray Dup', :OWNER::uuid, now());
INSERT INTO studio_contact_rules (subject_type, subject_id, channels_allowed, channels_forbidden, reason, set_by)
VALUES ('person','33330000-0000-4000-8000-000000000001', ARRAY['email','mobile'], ARRAY[]::text[], 'Use email or the mobile.', :OWNER::uuid),
       ('person','33330000-0000-4000-8000-000000000002', ARRAY[]::text[], ARRAY['sms','mobile'], 'Never text. Never ring the mobile.', :OWNER::uuid);
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
SELECT 'RESIDUAL merge' AS probe, public.merge_studio_contacts('33330000-0000-4000-8000-000000000001','33330000-0000-4000-8000-000000000002','phone')::text;
SELECT 'RESIDUAL rule on survivor' AS probe, public.contact_rule_summary('person','33330000-0000-4000-8000-000000000001');
SELECT 'RESIDUAL rule left behind' AS probe, channels_forbidden, reason FROM studio_contact_rules WHERE subject_id='33330000-0000-4000-8000-000000000002';
SELECT 'RESIDUAL directory row for the folded card' AS probe, count(*) FROM people_directory WHERE person_id='33330000-0000-4000-8000-000000000002';
ROLLBACK;
