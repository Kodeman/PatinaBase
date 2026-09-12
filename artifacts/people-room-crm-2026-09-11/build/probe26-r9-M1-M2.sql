-- Probe for the r9 review's M1 and M2, after the fix. Self-contained; ROLLBACKs.
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
--     -f artifacts/people-room-crm-2026-09-11/build/probe26-r9-M1-M2.sql
BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a9000000-0000-4000-8000-000000000001', 'probe26@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a9000000-0000-4000-8000-000000000001', 'probe26@test.invalid', 'Probe', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at)
VALUES ('b9000000-0000-4000-8000-000000000001', 'design_studio', 'Probe26 Studio', 'probe26-studio', 'active', NOW(), NOW());
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES ('a9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'owner', 'active', NOW(), NOW(), NOW());
INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES ('d9000000-0000-4000-8000-000000000001', 'Probe26 job', 'a9000000-0000-4000-8000-000000000001',
        'b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001', 'active', NOW(), NOW());

-- ── M1: a standing evidenced grant, then a STOP, then ONE reconsent ────────
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, sms_consent_status)
VALUES ('e9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001',
        'sub', 'M1 Seat', '(612) 555-0901', 'not_asked');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a9000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SELECT public.record_channel_consent('b9000000-0000-4000-8000-000000000001','sms','612-555-0901',
  'granted','written','Signed the kickoff form','v3',NULL) IS NOT NULL AS granted_recorded;
RESET ROLE;
UPDATE studio_channel_consent SET consented_at = '2025-05-02', recorded_at = '2025-05-02'
 WHERE organization_id = 'b9000000-0000-4000-8000-000000000001' AND channel_value = '+16125550901';
SET LOCAL ROLE authenticated;
SELECT public.record_channel_consent('b9000000-0000-4000-8000-000000000001','sms','612-555-0901',
  'opted_out','inbound_sms','Replied STOP',NULL,NULL) IS NOT NULL AS stop_recorded;

\echo '=== M1 --- before reconsent ---'
RESET ROLE;
SELECT status, consented_at, source, evidence, recorded_at, disclosure_version
  FROM studio_channel_consent
 WHERE organization_id = 'b9000000-0000-4000-8000-000000000001' AND channel_value = '+16125550901';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a9000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SELECT public.record_channel_reconsent('b9000000-0000-4000-8000-000000000001','sms','612-555-0901',
  'verbal','He said it is fine now','v9',NULL) IS NOT NULL AS reconsent_recorded;
RESET ROLE;
\echo '=== M1 --- after ONE record_channel_reconsent(...,verbal,...,v9) ---'
SELECT status, consented_at, source, evidence, recorded_at, disclosure_version,
       opt_out_at, opt_out_source, refusal_unanswered
  FROM studio_channel_consent
 WHERE organization_id = 'b9000000-0000-4000-8000-000000000001' AND channel_value = '+16125550901';

-- ── M2: the shipped portal's sourceless refusal beside an evidenced grant ──
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consented_at, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence, sms_consent_recorded_at,
                             sms_consent_disclosure_version, sms_consent_recorded_by)
VALUES
  ('e9000000-0000-4000-8000-000000000002','d9000000-0000-4000-8000-000000000001','sub','Refusing Seat','(612) 555-0902',
   'opted_out', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('e9000000-0000-4000-8000-000000000003','d9000000-0000-4000-8000-000000000001','installer','Granted Seat','612.555.0902',
   'granted','2025-05-02T00:00:00Z',NULL,'written','Signed the kickoff form','2025-05-02T00:00:00Z','v3',
   'a9000000-0000-4000-8000-000000000001');

\echo '=== M2 --- fold a group holding a sourceless refusal BESIDE a fully evidenced grant ==='
SELECT public.backfill_channel_consent_from_parties() AS folded;
SELECT status, refusal_unanswered, opt_out_at, source, evidence, recorded_at,
       disclosure_version, (recorded_by IS NOT NULL) AS has_recorder, consented_at, opt_out_source
  FROM studio_channel_consent
 WHERE organization_id = 'b9000000-0000-4000-8000-000000000001' AND channel_value = '+16125550902';

\echo '=== M2 --- the seats after R-AQ (the wipe is ruled; the RECORD now holds the proof) ==='
SELECT display_name, sms_consent_status, sms_consent_source, sms_consent_evidence, sms_consented_at
  FROM project_parties
 WHERE phone_e164 = '+16125550902' ORDER BY display_name;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a9000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SELECT public.record_channel_reconsent('b9000000-0000-4000-8000-000000000001','sms','612-555-0902',
  'written','Fresh signed consent','v9',NULL) IS NOT NULL AS reconsent_recorded;
RESET ROLE;
\echo '=== M2 --- and after ONE ordinary reconsent the record still carries a dated, evidenced consent ==='
SELECT status, consented_at, source, evidence, disclosure_version, opt_out_source
  FROM studio_channel_consent
 WHERE organization_id = 'b9000000-0000-4000-8000-000000000001' AND channel_value = '+16125550902';

ROLLBACK;
