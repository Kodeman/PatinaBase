BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('a3000000-0000-4000-8000-000000000001','p3-a@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES
 ('a3000000-0000-4000-8000-000000000001','p3-a@test.invalid','A',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at) VALUES
 ('b3000000-0000-4000-8000-00000000000a','design_studio','P3 Alpha','p3-alpha','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES
 ('a3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO studio_contacts (id,organization_id,entity_kind,contact_kind,full_name,company_name,created_by) VALUES
 ('c3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-00000000000a','person','sub','P',NULL,'a3000000-0000-4000-8000-000000000001'),
 ('c3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-00000000000a','company','sub',NULL,'Firm','a3000000-0000-4000-8000-000000000001');
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a3000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- 3a: route_to_person_id naming the SUBJECT itself
  BEGIN
    INSERT INTO studio_contact_rules (subject_type,subject_id,route_to_person_id,reason)
    VALUES ('person','c3000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','self-route');
    RAISE NOTICE 'PROBE3a: self-route ACCEPTED';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE3a: refused %', SQLERRM; END;
  -- 3b: route_to_person_id naming a COMPANY card
  BEGIN
    INSERT INTO studio_contact_rules (subject_type,subject_id,route_to_person_id,reason)
    VALUES ('company','c3000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000002','route to a firm');
    RAISE NOTICE 'PROBE3b: route to a COMPANY card ACCEPTED';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE3b: refused %', SQLERRM; END;
  -- 3c: channels_allowed / channels_forbidden vocabulary — is anything checked?
  BEGIN
    UPDATE studio_contact_rules SET channels_forbidden = ARRAY['carrier pigeon','sms']
     WHERE subject_id='c3000000-0000-4000-8000-000000000001';
    RAISE NOTICE 'PROBE3c: an out-of-vocabulary channels_forbidden value ACCEPTED';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE3c: refused %', SQLERRM; END;
  -- 3d: studio_verdict vocabulary
  BEGIN
    UPDATE studio_contacts SET studio_verdict='anything at all', trades=ARRAY['not-a-trade']
     WHERE id='c3000000-0000-4000-8000-000000000002';
    RAISE NOTICE 'PROBE3d: free-text studio_verdict + unvetted trades ACCEPTED';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE3d: refused %', SQLERRM; END;
  -- 3e: a negative retainage / >100%
  BEGIN
    UPDATE studio_contacts SET retainage_bps=-500 WHERE id='c3000000-0000-4000-8000-000000000002';
    RAISE NOTICE 'PROBE3e: negative retainage_bps ACCEPTED';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE3e: refused %', SQLERRM; END;
  -- 3f: two PREFERRED channels of the same kind on one card (crm-model: one per kind)
  BEGIN
    INSERT INTO studio_contact_channels (owner_type,owner_id,channel_kind,value,preferred) VALUES
      ('person','c3000000-0000-4000-8000-000000000001','mobile','612-555-0001',true),
      ('person','c3000000-0000-4000-8000-000000000001','mobile','612-555-0002',true);
    RAISE NOTICE 'PROBE3f: two preferred mobile channels on one card ACCEPTED';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE3f: refused %', SQLERRM; END;
  EXECUTE 'RESET ROLE';
END $$;
ROLLBACK;
