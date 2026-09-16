BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('a6000000-0000-4000-8000-000000000001','p6-a@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES
 ('a6000000-0000-4000-8000-000000000001','p6-a@test.invalid','A',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at) VALUES
 ('b6000000-0000-4000-8000-00000000000a','design_studio','P6 Alpha','p6-alpha','active',NOW(),NOW()),
 ('b6000000-0000-4000-8000-00000000000b','design_studio','P6 Beta','p6-beta','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES
 ('a6000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO studio_contacts (id,organization_id,entity_kind,contact_kind,full_name,company_name,created_by) VALUES
 ('c6000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-00000000000a','person','sub','Rosa',NULL,'a6000000-0000-4000-8000-000000000001'),
 ('c6000000-0000-4000-8000-000000000002','b6000000-0000-4000-8000-00000000000a','company','sub',NULL,'Firm','a6000000-0000-4000-8000-000000000001');
UPDATE studio_contacts SET paperwork_contact_person_id='c6000000-0000-4000-8000-000000000001' WHERE id='c6000000-0000-4000-8000-000000000002';
INSERT INTO studio_person_affiliations (id, person_id, company_id, role_at_firm)
VALUES ('f6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000002','pm');
DO $$
DECLARE k text; o uuid; c uuid;
BEGIN
  -- 6a: move the DESIGNATED person card to another studio. Does anything object?
  BEGIN
    UPDATE studio_contacts SET organization_id='b6000000-0000-4000-8000-00000000000b'
     WHERE id='c6000000-0000-4000-8000-000000000001';
    SELECT organization_id INTO o FROM studio_contacts WHERE id='c6000000-0000-4000-8000-000000000001';
    RAISE NOTICE 'PROBE6a: the designated person moved to org % while the firm still names them -> cross-tenant designation now standing', o;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE6a: refused %', SQLERRM; END;
  -- 6b: the affiliation now straddles two studios; is it still readable/valid?
  SELECT public.studio_contact_org(person_id), public.studio_contact_org(company_id)
    INTO o, c FROM studio_person_affiliations WHERE id='f6000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'PROBE6b: affiliation person_org=% company_org=% (RLS SELECT keys on person_org only)', o, c;
  -- 6c: flip the designated card from person to company
  BEGIN
    UPDATE studio_contacts SET entity_kind='company', company_name='Now a firm', full_name=NULL
     WHERE id='c6000000-0000-4000-8000-000000000001';
    SELECT entity_kind INTO k FROM studio_contacts WHERE id='c6000000-0000-4000-8000-000000000001';
    RAISE NOTICE 'PROBE6c: the designated/affiliated card is now entity_kind=% with both pointers still standing', k;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE6c: refused %', SQLERRM; END;
END $$;
ROLLBACK;
