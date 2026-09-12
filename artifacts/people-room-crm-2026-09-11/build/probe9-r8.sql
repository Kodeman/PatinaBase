-- r8 probes: W4-M1 (the sibling seat's refusal) and W4-M2 (the refusal's own
-- evidence). Rolled back.
BEGIN;
SET LOCAL client_min_messages = warning;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a9000000-0000-4000-8000-000000000001','r8-alice@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a9000000-0000-4000-8000-000000000001','r8-alice@test.invalid','Alice',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at)
VALUES ('b9000000-0000-4000-8000-00000000000a','design_studio','R8 Studio','r8-studio','active',NOW(),NOW());
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES ('a9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES ('d9000000-0000-4000-8000-00000000000a','R8 job one','a9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-00000000000a','a9000000-0000-4000-8000-000000000001','active',NOW(),NOW()),
       ('d9000000-0000-4000-8000-00000000000b','R8 job two','a9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-00000000000a','a9000000-0000-4000-8000-000000000001','active',NOW(),NOW());

-- THE REVIEWER'S SHAPE: one studio, two seats on +16125550199 — a clean
-- 10-day-old grant, and a legacy row reading `granted` while carrying a
-- 300-day-old unanswered opt-out.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consented_at, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version)
VALUES
  ('e9000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-00000000000a','sub','Seat One','+16125550199',
   'granted', now() - interval '10 days', NULL, 'written','clean recent grant', now() - interval '10 days','field-sms-v1'),
  ('e9000000-0000-4000-8000-000000000002','d9000000-0000-4000-8000-00000000000b','sub','Seat Two','+16125550199',
   'granted', NULL, now() - interval '300 days', 'inbound_sms','Replied STOP', now() - interval '300 days','field-sms-v1');

SELECT public.backfill_channel_consent_from_parties() AS folded;

\echo '=== W4-M1: the record the fold mints (was: granted / f / NULL) ==='
SELECT status, refusal_unanswered, consented_at::date, opt_out_at::date,
       opt_out_source, opt_out_evidence, opt_out_recorded_at::date
  FROM studio_channel_consent
 WHERE organization_id = 'b9000000-0000-4000-8000-00000000000a'
   AND channel_value = '+16125550199';

\echo '=== W4-M1: what the send gate sees on the seats (status only) ==='
SELECT display_name, sms_consent_status, sms_opt_out_at::date FROM project_parties
 WHERE phone_e164 = '+16125550199' ORDER BY display_name;

-- ── W4-M2 ─────────────────────────────────────────────────────────────────
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, sms_consent_status)
VALUES ('e9000000-0000-4000-8000-000000000003','d9000000-0000-4000-8000-00000000000a','sub','Ida Ruiz','+16125550431','not_asked');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a9000000-0000-4000-8000-000000000001','role','authenticated')::text, true);

SELECT public.record_channel_consent('b9000000-0000-4000-8000-00000000000a','sms','+16125550431','opted_out','inbound_sms','Replied STOP',NULL,NULL) IS NOT NULL AS stop_recorded;
SELECT public.record_channel_reconsent('b9000000-0000-4000-8000-00000000000a','sms','+16125550431','written','Signed re-consent form, 11 Sep 2026','v2',NULL) IS NOT NULL AS reconsented;
RESET ROLE;

\echo '=== W4-M2: the record after reconsent (was: source written / "Signed re-consent form" only) ==='
SELECT status, refusal_unanswered, source, evidence, disclosure_version,
       opt_out_source, opt_out_evidence
  FROM studio_channel_consent
 WHERE organization_id = 'b9000000-0000-4000-8000-00000000000a'
   AND channel_value = '+16125550431';

\echo '=== W4-M2: the seat after the mirror ran ==='
SELECT sms_consent_status, sms_consent_source, sms_consent_evidence
  FROM project_parties WHERE id = 'e9000000-0000-4000-8000-000000000003';

ROLLBACK;
