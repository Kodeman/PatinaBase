BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('a2000000-0000-4000-8000-000000000001','rv2-owner@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
       ('a2000000-0000-4000-8000-000000000002','rv2-client@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES
 ('a2000000-0000-4000-8000-000000000001','rv2-owner@test.invalid','Owner',NOW(),NOW()),
 ('a2000000-0000-4000-8000-000000000002','rv2-client@test.invalid','Homeowner',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at)
VALUES ('b2000000-0000-4000-8000-00000000000a','design_studio','RV2 Alpha','rv2-alpha','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at)
VALUES ('a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at)
VALUES ('d2000000-0000-4000-8000-00000000000a','RV2 job','a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000000a','a2000000-0000-4000-8000-000000000001','active',NOW(),NOW());
INSERT INTO studio_contacts (id,organization_id,entity_kind,contact_kind,full_name,created_by)
VALUES ('c2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000000a','person','sub','Dana',
        'a2000000-0000-4000-8000-000000000001');
INSERT INTO studio_contact_channels (owner_type,owner_id,channel_kind,value)
VALUES ('person','c2000000-0000-4000-8000-000000000001','mobile','+16125550444');
INSERT INTO studio_contact_rules (subject_type,subject_id,channels_forbidden,reason)
VALUES ('person','c2000000-0000-4000-8000-000000000001',ARRAY['mobile'],'never text');
INSERT INTO studio_channel_consent (organization_id,channel_kind,channel_value,status)
VALUES ('b2000000-0000-4000-8000-00000000000a','sms','+16125550444','opted_out');

\echo '--- as the STUDIO OWNER ---'
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT (SELECT count(*) FROM studio_contact_channels) ch,
       (SELECT count(*) FROM studio_contact_rules) ru,
       (SELECT count(*) FROM studio_channel_consent) co,
       (SELECT count(*) FROM studio_person_affiliations) af;
RESET ROLE;

\echo '--- as a NON-MEMBER (homeowner/client-portal user) ---'
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT (SELECT count(*) FROM studio_contact_channels) ch,
       (SELECT count(*) FROM studio_contact_rules) ru,
       (SELECT count(*) FROM studio_channel_consent) co,
       (SELECT count(*) FROM studio_person_affiliations) af;
\echo '--- direct writes as non-member ---'
DO $$ BEGIN
  BEGIN INSERT INTO studio_channel_consent (organization_id,channel_kind,channel_value,status)
        VALUES ('b2000000-0000-4000-8000-00000000000a','sms','+16125550999','granted');
        RAISE NOTICE 'consent INSERT SUCCEEDED (BAD)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'consent INSERT refused: %', SQLSTATE; END;
  BEGIN INSERT INTO studio_contact_channels (owner_type,owner_id,channel_kind,value)
        VALUES ('person','c2000000-0000-4000-8000-000000000001','mobile','+16125550888');
        RAISE NOTICE 'channel INSERT SUCCEEDED (BAD)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'channel INSERT refused: %', SQLSTATE; END;
END $$;
\echo '--- as anon ---'
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM count(*) FROM studio_channel_consent; RAISE NOTICE 'anon SELECT consent SUCCEEDED (BAD)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'anon SELECT consent refused: %', SQLSTATE; END;
  BEGIN PERFORM count(*) FROM studio_contact_channels; RAISE NOTICE 'anon SELECT channels SUCCEEDED (BAD)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'anon SELECT channels refused: %', SQLSTATE; END;
END $$;
RESET ROLE;
ROLLBACK;
