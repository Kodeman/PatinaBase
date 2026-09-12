-- Negative control for r7 R7-M1: the SAME scenario as test block 28, run first
-- against the PRE-FIX record_channel_consent (restored inside this transaction
-- from git HEAD) and then against the shipped one. Rolled back.
BEGIN;

\set ON_ERROR_STOP on

-- fixtures
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a0000000-0000-4000-8000-0000000000f1', 'r7m1-owner@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a0000000-0000-4000-8000-0000000000f1', 'r7m1-owner@test.invalid', 'Fern', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at)
VALUES ('b0000000-0000-4000-8000-0000000000f1', 'design_studio', 'R7M1 Studio', 'r7m1-studio', 'active', NOW(), NOW());
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES ('a0000000-0000-4000-8000-0000000000f1', 'b0000000-0000-4000-8000-0000000000f1', 'owner', 'active', NOW(), NOW(), NOW());
INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES ('d0000000-0000-4000-8000-0000000000f1', 'R7M1 job', 'a0000000-0000-4000-8000-0000000000f1',
        'b0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000f1', 'active', NOW(), NOW());
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, sms_consent_status)
VALUES ('e0000000-0000-4000-8000-0000000000f1', 'd0000000-0000-4000-8000-0000000000f1', 'sub', 'Ari Benet', '612-555-0435', 'not_asked');

-- the inbound STOP rail's write
INSERT INTO studio_channel_consent (organization_id, channel_kind, channel_value, status,
  opt_out_at, refusal_unanswered, opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by)
VALUES ('b0000000-0000-4000-8000-0000000000f1', 'sms', '+16125550435', 'opted_out',
        '2025-12-03T00:00:00Z', true, 'inbound_sms', 'Inbound STOP', '2025-12-03T00:00:00Z', NULL);

\echo '--- the refusal as the carrier rail recorded it ---'
SELECT opt_out_at, opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by
  FROM studio_channel_consent
 WHERE organization_id = 'b0000000-0000-4000-8000-0000000000f1' AND channel_value = '+16125550435';
SELECT sms_opt_out_at, sms_consent_source, sms_consent_evidence
  FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000f1';

-- ── PRE-FIX function, restored from git HEAD ──────────────────────────────
\i :old_fn

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a0000000-0000-4000-8000-0000000000f1','role','authenticated')::text, true);
SELECT 1 FROM public.record_channel_consent(
  'b0000000-0000-4000-8000-0000000000f1', 'sms', '612-555-0435', 'opted_out',
  'verbal', 'He told me on site', NULL, NULL) LIMIT 1;
RESET role;
SELECT set_config('request.jwt.claims', NULL, true);

\echo '--- PRE-FIX: after one studio-side opted_out re-record (record) ---'
SELECT opt_out_at, opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by
  FROM studio_channel_consent
 WHERE organization_id = 'b0000000-0000-4000-8000-0000000000f1' AND channel_value = '+16125550435';
\echo '--- PRE-FIX: and on the seat ---'
SELECT sms_opt_out_at, sms_consent_source, sms_consent_evidence
  FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000f1';

ROLLBACK;

-- ═══ SECTION 2: the SAME scenario against the SHIPPED function ═══
BEGIN;

\set ON_ERROR_STOP on

-- fixtures
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a0000000-0000-4000-8000-0000000000f1', 'r7m1-owner@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a0000000-0000-4000-8000-0000000000f1', 'r7m1-owner@test.invalid', 'Fern', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at)
VALUES ('b0000000-0000-4000-8000-0000000000f1', 'design_studio', 'R7M1 Studio', 'r7m1-studio', 'active', NOW(), NOW());
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES ('a0000000-0000-4000-8000-0000000000f1', 'b0000000-0000-4000-8000-0000000000f1', 'owner', 'active', NOW(), NOW(), NOW());
INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES ('d0000000-0000-4000-8000-0000000000f1', 'R7M1 job', 'a0000000-0000-4000-8000-0000000000f1',
        'b0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000f1', 'active', NOW(), NOW());
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, sms_consent_status)
VALUES ('e0000000-0000-4000-8000-0000000000f1', 'd0000000-0000-4000-8000-0000000000f1', 'sub', 'Ari Benet', '612-555-0435', 'not_asked');

-- the inbound STOP rail's write
INSERT INTO studio_channel_consent (organization_id, channel_kind, channel_value, status,
  opt_out_at, refusal_unanswered, opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by)
VALUES ('b0000000-0000-4000-8000-0000000000f1', 'sms', '+16125550435', 'opted_out',
        '2025-12-03T00:00:00Z', true, 'inbound_sms', 'Inbound STOP', '2025-12-03T00:00:00Z', NULL);

\echo '--- SHIPPED: the refusal as the carrier rail recorded it ---'
SELECT opt_out_at, opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by
  FROM studio_channel_consent
 WHERE organization_id = 'b0000000-0000-4000-8000-0000000000f1' AND channel_value = '+16125550435';
SELECT sms_opt_out_at, sms_consent_source, sms_consent_evidence
  FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000f1';


SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a0000000-0000-4000-8000-0000000000f1','role','authenticated')::text, true);
SELECT 1 FROM public.record_channel_consent(
  'b0000000-0000-4000-8000-0000000000f1', 'sms', '612-555-0435', 'opted_out',
  'verbal', 'He told me on site', NULL, NULL) LIMIT 1;
RESET role;
SELECT set_config('request.jwt.claims', NULL, true);

\echo '--- SHIPPED: after the same studio-side opted_out re-record (record) ---'
SELECT opt_out_at, opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by,
       source AS consent_source, evidence AS consent_evidence, recorded_by AS consent_recorded_by
  FROM studio_channel_consent
 WHERE organization_id = 'b0000000-0000-4000-8000-0000000000f1' AND channel_value = '+16125550435';
\echo '--- SHIPPED: and on the seat ---'
SELECT sms_opt_out_at, sms_consent_source, sms_consent_evidence, sms_consent_recorded_by
  FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000f1';

ROLLBACK;
