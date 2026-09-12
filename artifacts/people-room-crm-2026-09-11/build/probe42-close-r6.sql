BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('a8000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r6c-dee@test.invalid','x',NOW(),NOW(),NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a8000000-0000-4000-8000-000000000001','r6c-dee@test.invalid','Dee',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at) VALUES
  ('b8000000-0000-4000-8000-000000000011','design_studio','R6c X','r6c-x','active',NOW(),NOW());
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at) VALUES
  ('a8000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000011','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at) VALUES
  ('d8000000-0000-4000-8000-000000000011','R6c job','a8000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000011','a8000000-0000-4000-8000-000000000001','active',NOW(),NOW());
-- Pete Rusk, fixture F-12: the pre-fold refusal lives on the seat.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
    sms_consent_status, sms_opt_out_at, sms_consent_source, sms_consent_evidence,
    sms_consent_recorded_at, sms_consent_disclosure_version) VALUES
  ('e8000000-0000-4000-8000-000000000701','d8000000-0000-4000-8000-000000000011','sub','Pete Rusk','6125550901',
   'opted_out','2025-12-03T00:00:00Z','inbound_sms','Replied STOP','2025-12-03T00:00:00Z','field-sms-v1');
SELECT public.backfill_channel_consent_from_parties();
-- the recipient replies START; the rail writes the record (writeChannelConsent)
UPDATE studio_channel_consent
   SET status='granted', refusal_unanswered=false, consented_at=clock_timestamp(),
       source='inbound_sms', evidence='Inbound START', recorded_at=clock_timestamp()
 WHERE organization_id='b8000000-0000-4000-8000-000000000011' AND channel_kind='sms' AND channel_value='+16125550901';

-- 00621's own gate, evaluated exactly as the trigger evaluates it
DO $$
DECLARE gate BOOLEAN; awaiting INT; word TEXT; seatref BOOLEAN;
BEGIN
  SELECT NOT (NOT COALESCE(public.channel_consent_status(
                public.project_consent_org('d8000000-0000-4000-8000-000000000011'),'sms','+16125550901')='granted', false)
              AND pp.sms_consent_status <> 'granted')
    INTO gate FROM project_parties pp WHERE pp.id='e8000000-0000-4000-8000-000000000701';
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a8000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT awaiting_reply_count INTO awaiting FROM field_activity_summary WHERE project_id='d8000000-0000-4000-8000-000000000011';
  SELECT sms_consent_status INTO word FROM v_project_roster WHERE roster_id='e8000000-0000-4000-8000-000000000701';
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT EXISTS (SELECT 1 FROM project_parties pp JOIN projects p ON p.id=pp.project_id
                  WHERE pp.phone_e164='+16125550901' AND pp.sms_consent_status='opted_out'
                    AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))='b8000000-0000-4000-8000-000000000011') INTO seatref;
  RAISE NOTICE '=== P6: test 16Be''s own state, asked of every READER ===';
  RAISE NOTICE 'P6a v_project_roster word              = %  -> "Texting"', word;
  RAISE NOTICE 'P6b Desk awaiting_reply_count          = %  -> the Desk says nothing either', awaiting;
  RAISE NOTICE 'P6c 00621 dispatch gate would dispatch = %  -> sms-dispatch fires', gate;
  RAISE NOTICE 'P6d send gate seat leg refuses         = %  -> sendPartySms {sent:false, reason:opted_out}', seatref;
END $$;
ROLLBACK;
