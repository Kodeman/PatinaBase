-- PROBE 1: a DATELESS opted_out seat and the record_channel_consent 'granted' door.
BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a1000000-0000-4000-8000-000000000001','p1-alice@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at)
VALUES ('a1000000-0000-4000-8000-000000000001','p1-alice@test.invalid','Alice',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at)
VALUES ('b1000000-0000-4000-8000-00000000000a','design_studio','P1 Alpha','p1-alpha','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at)
VALUES ('a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at)
VALUES ('d1000000-0000-4000-8000-00000000000a','P1 job','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-000000000001','active',NOW(),NOW());

-- The shape the shipped portal writes (use-coordination.ts:604-617): opted_out with NO date.
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,sms_consent_status,sms_opt_out_at)
VALUES ('e1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-00000000000a','sub','Pete Rusk','612-555-0177','opted_out',NULL);

DO $$
DECLARE r record; seat record; err text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a1000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT * INTO r FROM public.record_channel_consent(
      'b1000000-0000-4000-8000-00000000000a','sms','+16125550177','granted',
      'written','Signed a new field-sms form','field-sms-v1',
      'd1000000-0000-4000-8000-00000000000a');
    RAISE NOTICE 'PROBE1: record_channel_consent GRANTED went through. record.status=% refusal_unanswered=%', r.status, r.refusal_unanswered;
  EXCEPTION WHEN OTHERS THEN
    err := SQLERRM;
    RAISE NOTICE 'PROBE1: refused with %', err;
  END;
  EXECUTE 'RESET ROLE';
  SELECT sms_consent_status, sms_opt_out_at, sms_consented_at INTO seat
    FROM project_parties WHERE id='e1000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'PROBE1: the dateless-refusal SEAT now reads status=% opt_out_at=% consented_at=%',
    seat.sms_consent_status, seat.sms_opt_out_at, seat.sms_consented_at;
END $$;
ROLLBACK;
