\pset pager off
\timing on
BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('e1000000-0000-4000-8000-000000000001','r3perf@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES ('e1000000-0000-4000-8000-000000000001','r3perf@test.invalid','Perf',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at) VALUES ('e2000000-0000-4000-8000-00000000000a','design_studio','Perf','r3-perf','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES ('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at)
SELECT ('e300'||lpad(g::text,4,'0')||'-0000-4000-8000-00000000000a')::uuid, 'Perf job '||g,
       'e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000001','active',NOW(),NOW()
FROM generate_series(1,20) g;
INSERT INTO project_parties (project_id, party_kind, display_name, phone, sms_consent_status)
SELECT ('e300'||lpad(((g%20)+1)::text,4,'0')||'-0000-4000-8000-00000000000a')::uuid,
       'sub', 'Perf sub '||g, '612555'||lpad(g::text,4,'0'), 'not_asked'
FROM generate_series(1,600) g;
INSERT INTO studio_channel_consent (organization_id, channel_kind, channel_value, status, consented_at, source, evidence, recorded_at, disclosure_version)
SELECT 'e2000000-0000-4000-8000-00000000000a','sms', public.normalize_phone_e164('612555'||lpad(g::text,4,'0')),
       'granted', now(), 'written','form', now(), 'v1'
FROM generate_series(1,600) g
ON CONFLICT DO NOTHING;
ANALYZE project_parties; ANALYZE studio_channel_consent; ANALYZE projects;

SELECT set_config('request.jwt.claims', json_build_object('sub','e1000000-0000-4000-8000-000000000001','role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
\echo '=== v_project_roster over one project (30 party rows) ==='
EXPLAIN (ANALYZE, TIMING ON, SUMMARY ON) SELECT * FROM v_project_roster WHERE project_id='e3000001-0000-4000-8000-00000000000a';
\echo '=== people_directory, party branch, whole studio (600 rows) ==='
EXPLAIN (ANALYZE, TIMING ON, SUMMARY ON) SELECT status_raw, meta->>'sms_consent_status' FROM people_directory;
RESET ROLE;
ROLLBACK;
