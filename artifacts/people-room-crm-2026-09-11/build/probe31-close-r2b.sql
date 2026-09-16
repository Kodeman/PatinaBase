-- W1a close-review r2 — probe 31. One transaction, ROLLBACKed.
--   P4. the add-party `pending` call over a standing grant: does the grant's
--       DATE stay behind while the evidence set moves to the new act?
--   P5. what an `anon` caller now gets from the two repointed views.
--   P6. MINOR-2 re-check: the fold's `inbound_sms` short-circuit.

BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a3000000-0000-4000-8000-000000000001', 'r2b-alice@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a3000000-0000-4000-8000-000000000001', 'r2b-alice@test.invalid', 'Alice R2b', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at)
VALUES ('b3000000-0000-4000-8000-00000000000a', 'design_studio', 'R2b Studio', 'r2b-studio', 'active', NOW(), NOW());
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES ('a3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-00000000000a', 'owner', 'active', NOW(), NOW(), NOW());
INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES
  ('d3000000-0000-4000-8000-00000000000a', 'R2b Lindqvist', 'a3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'active', NOW(), NOW()),
  ('d3000000-0000-4000-8000-00000000000b', 'R2b Okonkwo',   'a3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'active', NOW(), NOW());

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ── P4 ──────────────────────────────────────────────────────────────────────
-- A recorded written grant from the 2025 job, back-dated the way a real one is.
SELECT pg_temp.assume_user('a3000000-0000-4000-8000-000000000001');
SELECT public.record_channel_consent(
  'b3000000-0000-4000-8000-00000000000a', 'sms', '+16125550501', 'granted',
  'written', 'Signed the Lindqvist kickoff form', 'field-sms-v3',
  'd3000000-0000-4000-8000-00000000000a');
SELECT pg_temp.reset_role();
UPDATE public.studio_channel_consent
   SET consented_at = '2025-05-02T00:00:00Z', recorded_at = '2025-05-02T00:00:00Z'
 WHERE organization_id = 'b3000000-0000-4000-8000-00000000000a'
   AND channel_value = '+16125550501';

\echo '=== P4 BEFORE ==='
SELECT status, consented_at, source, evidence, disclosure_version, recorded_at
  FROM public.studio_channel_consent
 WHERE organization_id = 'b3000000-0000-4000-8000-00000000000a' AND channel_value = '+16125550501';

-- useAddProjectParty's call when the designer adds that person to the new job
-- with "text updates" ticked (use-coordination.ts:461-471).
SELECT pg_temp.assume_user('a3000000-0000-4000-8000-000000000001');
SELECT public.record_channel_consent(
  'b3000000-0000-4000-8000-00000000000a', 'sms', '+16125550501', 'pending',
  'verbal', 'Said yes at the Okonkwo walkthrough', 'field-sms-v9',
  'd3000000-0000-4000-8000-00000000000b');
SELECT pg_temp.reset_role();

\echo '=== P4 AFTER: the grant date now stands under the pending act''s words ==='
SELECT status, consented_at, source, evidence, disclosure_version, recorded_at
  FROM public.studio_channel_consent
 WHERE organization_id = 'b3000000-0000-4000-8000-00000000000a' AND channel_value = '+16125550501';

-- ── P5 ──────────────────────────────────────────────────────────────────────
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, sms_consent_status)
VALUES ('e3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-00000000000b', 'sub', 'Anon probe', '6125550601', 'not_asked');

\echo '=== P5: an anon caller on the two repointed views ==='
DO $$
DECLARE raised text;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM 1 FROM public.v_project_roster LIMIT 1;
    RAISE NOTICE 'v_project_roster as anon: returned without error';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS raised = MESSAGE_TEXT;
    RAISE NOTICE 'v_project_roster as anon: %', raised;
  END;
  RESET ROLE;
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM 1 FROM public.people_directory LIMIT 1;
    RAISE NOTICE 'people_directory as anon: returned without error';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS raised = MESSAGE_TEXT;
    RAISE NOTICE 'people_directory as anon: %', raised;
  END;
  RESET ROLE;
END $$;

-- ── P6 ──────────────────────────────────────────────────────────────────────
-- A seat carrying an inbound_sms GRANT's evidence that a later STOP flipped.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consented_at, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version,
                             sms_consent_recorded_by)
VALUES ('e3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-00000000000a', 'sub', 'P6', '6125550701',
        'opted_out', '2025-03-01T00:00:00Z', '2025-12-03T00:00:00Z',
        'inbound_sms', 'Inbound YES', '2025-03-01T00:00:00Z', 'field-sms-v1',
        'a3000000-0000-4000-8000-000000000001');
SELECT public.backfill_channel_consent_from_parties();
\echo '=== P6 (MINOR-2 re-check): the refusal minted from a STOP-flipped inbound_sms GRANT ==='
SELECT status, opt_out_at, opt_out_source, opt_out_evidence, opt_out_recorded_at,
       (opt_out_recorded_by IS NOT NULL) AS opt_out_recorded_by_set
  FROM public.studio_channel_consent
 WHERE organization_id = 'b3000000-0000-4000-8000-00000000000a' AND channel_value = '+16125550701';

ROLLBACK;
