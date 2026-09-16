BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('a3000000-0000-4000-8000-000000000001','r6c@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES ('a3000000-0000-4000-8000-000000000001','r6c@test.invalid','A',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at) VALUES ('b3000000-0000-4000-8000-00000000000a','design_studio','R6C','r6c','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES ('a3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO studio_contacts (id,organization_id,entity_kind,contact_kind,full_name,created_by)
VALUES ('c3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-00000000000a','person','sub','Ingrid','a3000000-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claims', json_build_object('sub','a3000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
\echo '--- direct INSERT into studio_channel_consent as authenticated (expect 42501) ---'
DO $$ BEGIN
  INSERT INTO studio_channel_consent(organization_id,channel_kind,channel_value,status)
  VALUES ('b3000000-0000-4000-8000-00000000000a','sms','+16125550001','granted');
  RAISE NOTICE 'WROTE IT — no gate';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'refused: % / %', SQLSTATE, SQLERRM;
END $$;
\echo '--- empty-string channel value (R5-m10) ---'
DO $$ DECLARE v text; BEGIN
  INSERT INTO studio_contact_channels(owner_type,owner_id,channel_kind,value)
  VALUES ('person','c3000000-0000-4000-8000-000000000001','mobile','   ') RETURNING value INTO v;
  RAISE NOTICE 'stored value = [%] (length %)', v, length(v);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'refused: % / %', SQLSTATE, SQLERRM; END $$;
\echo '--- two preferred mobiles on one card (R5-m11) ---'
DO $$ DECLARE n int; BEGIN
  INSERT INTO studio_contact_channels(owner_type,owner_id,channel_kind,value,preferred)
  VALUES ('person','c3000000-0000-4000-8000-000000000001','mobile','6125550002',true),
         ('person','c3000000-0000-4000-8000-000000000001','mobile','6125550003',true);
  SELECT count(*) INTO n FROM studio_contact_channels WHERE owner_id='c3000000-0000-4000-8000-000000000001' AND preferred;
  RAISE NOTICE 'preferred mobiles on one card = %', n;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'refused: % / %', SQLSTATE, SQLERRM; END $$;
\echo '--- escalation_by_class takes an unmatched channel name ---'
DO $$ BEGIN
  INSERT INTO studio_contact_rules(subject_type,subject_id,escalation_by_class)
  VALUES ('person','c3000000-0000-4000-8000-000000000001','{"co":"carrier pigeon","draw":"SMS"}'::jsonb);
  RAISE NOTICE 'escalation_by_class accepted unmatched channel names';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'refused: % / %', SQLSTATE, SQLERRM; END $$;
\echo '--- trades takes any string (R5-m8) ---'
DO $$ BEGIN
  UPDATE studio_contacts SET trades='{not-a-trade}' WHERE id='c3000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'trades accepted a non-FieldTrade value';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'refused: % / %', SQLSTATE, SQLERRM; END $$;
RESET ROLE;
ROLLBACK;
