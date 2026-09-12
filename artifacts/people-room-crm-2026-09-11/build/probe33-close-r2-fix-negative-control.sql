-- probe33 — close-review r2 MAJOR-1 / MAJOR-2: the fixes are load-bearing.
--
-- Each half is run TWICE inside one rolled-back transaction: once against the
-- shipped (fixed) definitions, and once against the PRE-FIX body restored in
-- place. If the pre-fix leg did not reproduce the review's output, the fix
-- would not be what changed the answer.
\set ON_ERROR_STOP on
BEGIN;

-- ── fixture ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a9000000-0000-4000-8000-000000000001', 'p33@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a9000000-0000-4000-8000-000000000001', 'p33@test.invalid', 'P33', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at)
VALUES ('b9000000-0000-4000-8000-00000000000a', 'design_studio', 'P33 Studio', 'p33-studio', 'active', NOW(), NOW());
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES ('a9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-00000000000a', 'owner', 'active', NOW(), NOW(), NOW());
INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES ('d9000000-0000-4000-8000-00000000000a', 'P33 Okonkwo', 'a9000000-0000-4000-8000-000000000001',
        'b9000000-0000-4000-8000-00000000000a', 'a9000000-0000-4000-8000-000000000001', 'active', NOW(), NOW());

-- The studio's standing 2025 written grant (probe30 P1 / probe31 P4's shape).
INSERT INTO studio_channel_consent (organization_id, channel_kind, channel_value, status,
  consented_at, refusal_unanswered, source, evidence, recorded_at, disclosure_version)
VALUES ('b9000000-0000-4000-8000-00000000000a', 'sms', '+16125557001', 'granted',
        '2025-05-02T00:00:00Z', false, 'written', 'Signed the Lindqvist kickoff form',
        '2025-05-02T00:00:00Z', 'field-sms-v3');

-- A folded legacy row: granted on its face, unanswered refusal under it.
INSERT INTO studio_channel_consent (organization_id, channel_kind, channel_value, status,
  consented_at, opt_out_at, refusal_unanswered, source, evidence, recorded_at, disclosure_version)
VALUES ('b9000000-0000-4000-8000-00000000000a', 'sms', '+16125557002', 'granted',
        NULL, '2025-11-16T00:00:00Z', true, 'verbal', 'Said yes on site, years ago',
        '2024-02-01T00:00:00Z', 'field-sms-v1');

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, sms_consent_status)
VALUES ('e9000000-0000-4000-8000-00000000000a', 'd9000000-0000-4000-8000-00000000000a',
        'sub', 'Pete Rusk', '(612) 555-7002', 'not_asked');

\echo ''
\echo '════ MAJOR-1 · AFTER (shipped): the add path leaves the grant alone ════'
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a9000000-0000-4000-8000-000000000001','role','authenticated')::text, true);

SELECT status, source, evidence, disclosure_version, consented_at
  FROM public.record_channel_invite(
    'b9000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-7001',
    'verbal', 'Said yes at the Okonkwo walkthrough', 'field-sms-v9',
    'd9000000-0000-4000-8000-00000000000a');

\echo '-- and the record on disk:'
SELECT status, source, evidence, disclosure_version, consented_at, recorded_at
  FROM studio_channel_consent
 WHERE organization_id = 'b9000000-0000-4000-8000-00000000000a' AND channel_value = '+16125557001';

\echo '-- the raw door refuses the downgrade by name:'
DO $$
DECLARE raised TEXT;
BEGIN
  BEGIN
    PERFORM public.record_channel_consent(
      'b9000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-7001', 'pending',
      'verbal', 'Said yes at the Okonkwo walkthrough', 'field-sms-v9', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'record_channel_consent(pending) over a standing grant -> %',
    COALESCE(raised, '<WROTE, no error>');
END $$;
RESET role;

\echo ''
\echo '════ MAJOR-1 · BEFORE (pre-fix WHERE restored): the grant is demoted ════'
-- The pre-fix DO UPDATE, reduced to the legs that decided this case.
CREATE OR REPLACE FUNCTION pg_temp.prefix_record(p_org uuid, p_val text, p_status text,
  p_source text, p_evidence text, p_disc text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.studio_channel_consent AS scc (
    organization_id, channel_kind, channel_value, status, consented_at,
    refusal_unanswered, source, evidence, recorded_at, disclosure_version)
  VALUES (p_org, 'sms', p_val, p_status,
          CASE WHEN p_status = 'granted' THEN now() END,
          p_status = 'opted_out', p_source, p_evidence, now(), p_disc)
  ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE
  SET status = EXCLUDED.status,
      consented_at = CASE WHEN EXCLUDED.status = 'granted'
                          THEN EXCLUDED.consented_at ELSE scc.consented_at END,
      source = EXCLUDED.source, evidence = EXCLUDED.evidence,
      recorded_at = EXCLUDED.recorded_at, disclosure_version = EXCLUDED.disclosure_version
  WHERE (scc.status IS DISTINCT FROM 'opted_out' OR EXCLUDED.status = 'opted_out');
$$;

SELECT pg_temp.prefix_record('b9000000-0000-4000-8000-00000000000a', '+16125557001', 'pending',
  'verbal', 'Said yes at the Okonkwo walkthrough', 'field-sms-v9');
SELECT status, source, evidence, disclosure_version, consented_at, recorded_at
  FROM studio_channel_consent
 WHERE organization_id = 'b9000000-0000-4000-8000-00000000000a' AND channel_value = '+16125557001';

\echo ''
\echo '════ MAJOR-2 · AFTER (shipped): the unsendable record reads opted_out ════'
SELECT status AS status_column, refusal_unanswered,
       public.channel_consent_status('b9000000-0000-4000-8000-00000000000a','sms','+16125557002') AS reader_word
  FROM studio_channel_consent
 WHERE organization_id = 'b9000000-0000-4000-8000-00000000000a' AND channel_value = '+16125557002';

SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a9000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SELECT display_name, sms_consent_status AS roster_word FROM v_project_roster
 WHERE roster_id = 'e9000000-0000-4000-8000-00000000000a';
SELECT display_name, status_raw AS directory_word, meta->>'sms_consent_status' AS directory_meta_word
  FROM people_directory WHERE person_id = 'e9000000-0000-4000-8000-00000000000a' AND role = 'sub';
RESET role;

\echo ''
\echo '════ MAJOR-2 · BEFORE (pre-fix reader restored): it reads granted ════'
CREATE OR REPLACE FUNCTION public.channel_consent_status(
  p_organization_id uuid, p_channel_kind text, p_channel_value text)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT scc.status FROM public.studio_channel_consent scc
   WHERE scc.organization_id = p_organization_id
     AND scc.channel_kind = p_channel_kind AND scc.channel_value = p_channel_value
$$;

SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a9000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SELECT display_name, sms_consent_status AS roster_word FROM v_project_roster
 WHERE roster_id = 'e9000000-0000-4000-8000-00000000000a';
SELECT display_name, status_raw AS directory_word, meta->>'sms_consent_status' AS directory_meta_word
  FROM people_directory WHERE person_id = 'e9000000-0000-4000-8000-00000000000a' AND role = 'sub';
RESET role;

ROLLBACK;
