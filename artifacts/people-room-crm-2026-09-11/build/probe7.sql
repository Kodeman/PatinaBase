BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('a7000000-0000-4000-8000-000000000001','p7-a@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES
 ('a7000000-0000-4000-8000-000000000001','p7-a@test.invalid','A',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at) VALUES
 ('b7000000-0000-4000-8000-00000000000a','design_studio','P7 Alpha','p7-alpha','active',NOW(),NOW()),
 ('b7000000-0000-4000-8000-00000000000b','design_studio','P7 Beta','p7-beta','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES
 ('a7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW()),
 ('a7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-00000000000b','owner','active',NOW(),NOW(),NOW());
INSERT INTO studio_contacts (id,organization_id,entity_kind,contact_kind,full_name,created_by) VALUES
 ('c7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-00000000000a','person','sub','P','a7000000-0000-4000-8000-000000000001');
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at) VALUES
 ('d7000000-0000-4000-8000-00000000000b','Beta job','a7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-00000000000b','a7000000-0000-4000-8000-000000000001','active',NOW(),NOW());
DO $$
DECLARE v text; n int; r record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a7000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- 7a: empty / whitespace-only channel value (m5-2)
  BEGIN
    INSERT INTO studio_contact_channels (owner_type,owner_id,channel_kind,value)
    VALUES ('person','c7000000-0000-4000-8000-000000000001','mobile','   ');
    SELECT value INTO v FROM studio_contact_channels WHERE owner_id='c7000000-0000-4000-8000-000000000001';
    RAISE NOTICE 'PROBE7a: whitespace channel stored as [%] length %', v, length(v);
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE7a: refused %', SQLERRM; END;
  -- 7b: consent RPC on a blank value
  BEGIN
    PERFORM public.record_channel_consent('b7000000-0000-4000-8000-00000000000a','sms','   ','pending','verbal','x','v1');
    RAISE NOTICE 'PROBE7b: blank consent value ACCEPTED';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE7b: refused %', SQLERRM; END;
  -- 7c: origin_project_id pointed at ANOTHER studio's project
  SELECT * INTO r FROM public.record_channel_consent(
    'b7000000-0000-4000-8000-00000000000a','sms','612-555-0300','pending','verbal','x','v1',
    'd7000000-0000-4000-8000-00000000000b');
  RAISE NOTICE 'PROBE7c: consent for org ALPHA stored origin_project_id=% which belongs to BETA', r.origin_project_id;
  EXECUTE 'RESET ROLE';
  -- 7d: a service_role DELETE of the record leaves the mirrored seats frozen (m5-9)
  SELECT count(*) INTO n FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE t.tgrelid='public.studio_channel_consent'::regclass AND p.proname='mirror_channel_consent_to_parties'
     AND (t.tgtype::int & 8) = 8;  -- 8 = DELETE
  RAISE NOTICE 'PROBE7d: mirror triggers covering DELETE = %', n;
END $$;
ROLLBACK;
