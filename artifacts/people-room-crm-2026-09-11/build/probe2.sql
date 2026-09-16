BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('a2000000-0000-4000-8000-000000000001','p2-a@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
       ('a2000000-0000-4000-8000-000000000002','p2-b@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES
 ('a2000000-0000-4000-8000-000000000001','p2-a@test.invalid','A',NOW(),NOW()),
 ('a2000000-0000-4000-8000-000000000002','p2-b@test.invalid','B',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at) VALUES
 ('b2000000-0000-4000-8000-00000000000a','design_studio','P2 Alpha','p2-alpha','active',NOW(),NOW()),
 ('b2000000-0000-4000-8000-00000000000b','design_studio','P2 Beta','p2-beta','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES
 ('a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW()),
 ('a2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-00000000000b','owner','active',NOW(),NOW(),NOW());
INSERT INTO studio_contacts (id,organization_id,entity_kind,contact_kind,full_name,company_name,created_by) VALUES
 ('c2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000000a','person','sub','Alpha Person',NULL,'a2000000-0000-4000-8000-000000000001'),
 ('c2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-00000000000b','person','sub','Beta Person',NULL,'a2000000-0000-4000-8000-000000000002');

-- PROBE 2a: can an Alpha member route a contact rule at a BETA person card?
DO $$
DECLARE n int; err text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a2000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO studio_contact_rules (subject_type, subject_id, route_to_person_id, reason)
    VALUES ('person','c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002','route across tenants');
    RAISE NOTICE 'PROBE2a: cross-studio route_to_person_id ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PROBE2a: refused %', SQLERRM;
  END;
  -- PROBE 2b: a rule whose subject_id names nothing at all
  BEGIN
    INSERT INTO studio_contact_rules (subject_type, subject_id, reason)
    VALUES ('person','00000000-0000-4000-8000-0000000000ff','orphan subject');
    RAISE NOTICE 'PROBE2b: orphan-subject rule ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PROBE2b: refused %', SQLERRM;
  END;
  -- PROBE 2c: an engagement rule whose subject_id is actually a studio_contacts id
  BEGIN
    INSERT INTO studio_contact_rules (subject_type, subject_id, reason)
    VALUES ('engagement','c2000000-0000-4000-8000-000000000001','wrong-table subject');
    RAISE NOTICE 'PROBE2c: engagement rule on a card id ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PROBE2c: refused %', SQLERRM;
  END;
  -- PROBE 2d: can Alpha write a channel owned by a BETA card?
  BEGIN
    INSERT INTO studio_contact_channels (owner_type, owner_id, channel_kind, value)
    VALUES ('person','c2000000-0000-4000-8000-000000000002','mobile','612-555-0000');
    RAISE NOTICE 'PROBE2d: cross-studio channel ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PROBE2d: refused %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  -- PROBE 2e: what BETA can now see
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a2000000-0000-4000-8000-000000000002','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM studio_contact_rules;
  RAISE NOTICE 'PROBE2e: Beta sees % contact rules', n;
  EXECUTE 'RESET ROLE';
END $$;
ROLLBACK;
