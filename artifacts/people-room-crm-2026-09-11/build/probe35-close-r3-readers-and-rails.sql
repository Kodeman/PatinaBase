\pset pager off
BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
 ('c1000000-0000-4000-8000-000000000001','r3-al@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('c1000000-0000-4000-8000-000000000002','r3-be@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES
 ('c1000000-0000-4000-8000-000000000001','r3-al@test.invalid','Al',NOW(),NOW()),
 ('c1000000-0000-4000-8000-000000000002','r3-be@test.invalid','Be',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at) VALUES
 ('c2000000-0000-4000-8000-00000000000a','design_studio','R3 Alpha','r3-alpha','active',NOW(),NOW()),
 ('c2000000-0000-4000-8000-00000000000b','design_studio','R3 Beta','r3-beta','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES
 ('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW()),
 ('c1000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-00000000000b','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at) VALUES
 ('c3000000-0000-4000-8000-00000000000a','R3 Alpha job','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000001','active',NOW(),NOW()),
 ('c3000000-0000-4000-8000-00000000000b','R3 Beta job','c1000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-00000000000b','c1000000-0000-4000-8000-000000000002','active',NOW(),NOW());

-- Alpha seat, invited (pending). Beta seat on the same number, refused.
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,sms_consent_status,
                             sms_consent_source,sms_consent_evidence,sms_consent_recorded_at,
                             sms_consent_disclosure_version)
VALUES
 ('c4000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-00000000000a','sub','Joe Wozniak','612-555-0777',
  'pending','written','Okonkwo kickoff form','2026-09-01T00:00:00Z','field-sms-v1'),
 ('c4000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-00000000000b','sub','Joe Wozniak','612-555-0777',
  'opted_out','inbound_sms','Replied STOP','2025-12-03T00:00:00Z','field-sms-v1');

\echo '=== A. R-AL org scoping: Beta holds an opted_out SEAT on +16125550777; Alpha grants ==='
SELECT set_config('request.jwt.claims', json_build_object('sub','c1000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT status, refusal_unanswered FROM public.record_channel_consent(
  'c2000000-0000-4000-8000-00000000000a','sms','612-555-0777','granted',
  'written','Signed the Okonkwo kickoff form','field-sms-v1','c3000000-0000-4000-8000-00000000000a');
RESET ROLE;
SELECT organization_id, status, refusal_unanswered FROM studio_channel_consent WHERE channel_value='+16125550777' ORDER BY 1;

\echo '=== B. the two shipped readers, and the Desk rollup, on the SAME Alpha seat ==='
SELECT set_config('request.jwt.claims', json_build_object('sub','c1000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT 'v_project_roster' AS surface, display_name, sms_consent_status AS word
  FROM v_project_roster WHERE roster_id='c4000000-0000-4000-8000-000000000001';
SELECT 'people_directory' AS surface, display_name, status_raw AS word, meta->>'sms_consent_status' AS meta_word
  FROM people_directory WHERE person_id='c4000000-0000-4000-8000-000000000001';
SELECT 'field_activity_summary' AS surface, awaiting_reply_count
  FROM field_activity_summary WHERE project_id='c3000000-0000-4000-8000-00000000000a';
SELECT 'the frozen seat' AS surface, sms_consent_status FROM project_parties WHERE id='c4000000-0000-4000-8000-000000000001';
RESET ROLE;

\echo '=== C. field-daily''s recipient filter (sms_consent_status = granted) over the same studio ==='
SELECT count(*) AS field_daily_would_text
  FROM project_parties
 WHERE party_kind IN ('gc','sub','installer','receiver')
   AND sms_consent_status = 'granted'
   AND project_id = 'c3000000-0000-4000-8000-00000000000a';
SELECT count(*) AS record_says_granted
  FROM studio_channel_consent
 WHERE organization_id='c2000000-0000-4000-8000-00000000000a' AND status='granted';

\echo '=== D. site_request_send()''s consent write under the freeze ==='
DO $$
DECLARE raised TEXT; msg TEXT;
BEGIN
  BEGIN
    UPDATE public.project_parties SET sms_consent_status='pending'
     WHERE id='c4000000-0000-4000-8000-000000000002';
    raised := '(no error — the freeze did not fire)';
  EXCEPTION WHEN OTHERS THEN raised := SQLSTATE || ' ' || SQLERRM;
  END;
  RAISE NOTICE 'D1 direct seat UPDATE  -> %', raised;
END $$;

\echo '=== E. an opted_out seat moved onto a DIFFERENT number (the phone-edit path the hook allows) ==='
UPDATE public.project_parties SET phone='612-555-0888' WHERE id='c4000000-0000-4000-8000-000000000002';
SELECT id, phone_e164, sms_consent_status FROM project_parties WHERE id='c4000000-0000-4000-8000-000000000002';
SELECT set_config('request.jwt.claims', json_build_object('sub','c1000000-0000-4000-8000-000000000002','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE raised TEXT;
BEGIN
  BEGIN
    PERFORM public.record_channel_consent(
      'c2000000-0000-4000-8000-00000000000b','sms','612-555-0888','granted',
      'written','fresh signed consent for the corrected number','field-sms-v1',
      'c3000000-0000-4000-8000-00000000000b');
    raised := '(written)';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  RAISE NOTICE 'E1 Beta grants the CORRECTED number -> %', raised;
END $$;
RESET ROLE;

\echo '=== F. refuse_legacy_consent_write() is callable by authenticated ==='
SELECT set_config('request.jwt.claims', json_build_object('sub','c1000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE raised TEXT;
BEGIN
  BEGIN
    PERFORM public.refuse_legacy_consent_write();
    raised := '(returned)';
  EXCEPTION WHEN OTHERS THEN raised := SQLSTATE || ' ' || SQLERRM;
  END;
  RAISE NOTICE 'F1 direct call as authenticated -> %', raised;
END $$;
RESET ROLE;

\echo '=== G. an unparseable phone: the record lands on a key no reader uses (r2 MINOR-9) ==='
SELECT set_config('request.jwt.claims', json_build_object('sub','c1000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT channel_value, status FROM public.record_channel_invite(
  'c2000000-0000-4000-8000-00000000000a','sms','123','written','kickoff form','field-sms-v1',
  'c3000000-0000-4000-8000-00000000000a');
RESET ROLE;
SELECT public.normalize_channel_value('sms','123') AS rpc_key,
       public.normalize_phone_e164('123')          AS seat_key;

\echo '=== H. project_consent_org as a stranger (a Beta member asking about an Alpha project) ==='
SELECT set_config('request.jwt.claims', json_build_object('sub','c1000000-0000-4000-8000-000000000002','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.project_consent_org('c3000000-0000-4000-8000-00000000000a') AS beta_member_learns_alphas_org;
SELECT public.channel_consent_status('c2000000-0000-4000-8000-00000000000a','sms','+16125550777') AS beta_member_reads_alphas_verdict;
SELECT count(*) AS beta_member_sees_alpha_records FROM studio_channel_consent
 WHERE organization_id='c2000000-0000-4000-8000-00000000000a';
RESET ROLE;
ROLLBACK;
