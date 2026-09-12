-- ═══════════════════════════════════════════════════════════════════════════
-- W1a close-review r2 — my own probe. Objects and behaviour only; one
-- transaction, ROLLBACKed. Never the ledger.
--
--   P1. record_channel_consent(..., 'pending', ...) over a STANDING `granted`
--       record — the call useAddProjectParty now makes on every add with
--       "text updates" ticked (close-review r1 MAJOR-2 fix).
--   P2. the fold's `granted` + refusal_unanswered record, and what the two
--       shipped readers PRINT for it.
--   P3. re-check of close-review r1's MINOR-1 (the mint leg writes the grant's
--       five on a refusal) and MINOR-3 (the freeze guard keeps EXECUTE for
--       authenticated).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a2000000-0000-4000-8000-000000000001', 'r2-alice@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a2000000-0000-4000-8000-000000000001', 'r2-alice@test.invalid', 'Alice R2', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at)
VALUES ('b2000000-0000-4000-8000-00000000000a', 'design_studio', 'R2 Studio Alpha', 'r2-studio-alpha', 'active', NOW(), NOW());
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES ('a2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-00000000000a', 'owner', 'active', NOW(), NOW(), NOW());

INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES
  ('d2000000-0000-4000-8000-00000000000a', 'R2 Lindqvist kitchen', 'a2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-000000000001', 'active', NOW(), NOW()),
  ('d2000000-0000-4000-8000-00000000000b', 'R2 Okonkwo residence',  'a2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-000000000001', 'active', NOW(), NOW());

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ── P1 ──────────────────────────────────────────────────────────────────────
-- The studio holds a RECORDED GRANT for Dana's number from the 2025 job
-- (fixture F-11 exactly: "2025 Lindqvist consent carried by phone").
SELECT pg_temp.assume_user('a2000000-0000-4000-8000-000000000001');
SELECT public.record_channel_consent(
  'b2000000-0000-4000-8000-00000000000a', 'sms', '+16125550301', 'granted',
  'written', 'Signed the Lindqvist kickoff form', 'field-sms-v1',
  'd2000000-0000-4000-8000-00000000000a');
SELECT pg_temp.reset_role();

\echo '=== P1 BEFORE: the studio holds a recorded grant for this number ==='
SELECT status, refusal_unanswered, consented_at, source, evidence, disclosure_version
  FROM public.studio_channel_consent
 WHERE organization_id = 'b2000000-0000-4000-8000-00000000000a'
   AND channel_value = '+16125550301';

-- The designer adds Dana to the NEW job with "text updates" ticked. That is
-- exactly what useAddProjectParty (use-coordination.ts:461-471) now calls
-- before the INSERT.
SELECT pg_temp.assume_user('a2000000-0000-4000-8000-000000000001');
SELECT public.record_channel_consent(
  'b2000000-0000-4000-8000-00000000000a', 'sms', '+16125550301', 'pending',
  'verbal', 'Said yes at the Okonkwo walkthrough', 'field-sms-v1',
  'd2000000-0000-4000-8000-00000000000b');
SELECT pg_temp.reset_role();

\echo '=== P1 AFTER: the same record, once the party was added ==='
SELECT status, refusal_unanswered, consented_at, source, evidence, disclosure_version, origin_project_id
  FROM public.studio_channel_consent
 WHERE organization_id = 'b2000000-0000-4000-8000-00000000000a'
   AND channel_value = '+16125550301';

\echo '=== P1: what the send gate would read, and what the room prints ==='
SELECT public.channel_consent_status(
         'b2000000-0000-4000-8000-00000000000a', 'sms', '+16125550301') AS word_printed;

-- ── P2 ──────────────────────────────────────────────────────────────────────
-- The r8 W4-M1 legacy shape: one clean recent grant, and a sibling seat that
-- still reads `granted` while carrying an opt-out no later consent answered.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consented_at, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version)
VALUES
  ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-00000000000b', 'sub', 'Pete Rusk', '6125550399',
   'granted', '2026-02-02T00:00:00Z', NULL, 'written', 'newer grant', '2026-02-02T00:00:00Z', 'field-sms-v1'),
  ('e2000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-00000000000a', 'sub', 'Pete Rusk', '(612) 555-0399',
   'granted', NULL, '2025-11-16T00:00:00Z', 'inbound_sms', 'Replied STOP on the Rusk thread',
   '2025-11-16T00:00:00Z', 'field-sms-v1');

SELECT public.backfill_channel_consent_from_parties();

\echo '=== P2: the record the fold mints for that group ==='
SELECT status, refusal_unanswered, opt_out_at
  FROM public.studio_channel_consent
 WHERE organization_id = 'b2000000-0000-4000-8000-00000000000a'
   AND channel_value = '+16125550399';

\echo '=== P2: what v_project_roster and people_directory PRINT for that seat ==='
SELECT pg_temp.assume_user('a2000000-0000-4000-8000-000000000001');
SELECT display_name, sms_consent_status AS roster_word
  FROM public.v_project_roster
 WHERE roster_id = 'e2000000-0000-4000-8000-000000000001';
SELECT display_name, status_raw AS directory_word, meta->>'sms_consent_status' AS directory_meta_word
  FROM public.people_directory
 WHERE person_id = 'e2000000-0000-4000-8000-000000000001';
SELECT pg_temp.reset_role();

-- ── P3 ──────────────────────────────────────────────────────────────────────
\echo '=== P3 (MINOR-1 re-check): does an opted_out MINT still write the GRANT-side five? ==='
SELECT pg_temp.assume_user('a2000000-0000-4000-8000-000000000001');
SELECT public.record_channel_consent(
  'b2000000-0000-4000-8000-00000000000a', 'sms', '+16125550499', 'opted_out',
  'verbal', 'He told me on site', NULL, NULL);
SELECT pg_temp.reset_role();
SELECT status, source, evidence, (recorded_at IS NOT NULL) AS recorded_at_set,
       consented_at, opt_out_source, opt_out_evidence
  FROM public.studio_channel_consent
 WHERE organization_id = 'b2000000-0000-4000-8000-00000000000a'
   AND channel_value = '+16125550499';

\echo '=== P3 (MINOR-3 re-check): EXECUTE on the wave guard functions ==='
SELECT p.proname, p.prosecdef, p.proacl::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('refuse_legacy_consent_write',
                     'assert_studio_contact_identity_stable',
                     'assert_channel_owner_kind',
                     'project_consent_org',
                     'channel_consent_status')
 ORDER BY p.proname;

\echo '=== P3: grants on the two repointed views ==='
SELECT c.relname, c.relacl::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('v_project_roster', 'people_directory');

ROLLBACK;
