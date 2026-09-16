-- w1b final review r13 · MAJOR-1
-- The shipped inline add (useAddProjectParty, use-coordination.ts:500-512) on a
-- project that records NO studio cannot be auto-linked (00626 §1b:
-- rolodex_card_for_party_phone resolves project_recorded_studio()), so a carded
-- human becomes a SECOND people_directory identity — r12 MAJOR-2's defect,
-- surviving on the projects.studio_id IS NULL population (5 of 8 local).
-- The second row prints `not_asked` on the number Local Dev Studio's own record
-- says `opted_out`.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

\echo '--- 1. the record for Pete Rusk''s number, at the studio doing the work ---'
SELECT organization_id, channel_value, status FROM public.studio_channel_consent
 WHERE channel_value = '+16125550112';

\echo '--- 2. BEFORE: one row, one human ---'
SELECT count(*) AS directory_rows FROM public.people_directory;
SELECT person_id, role, display_name, seat_count, consent_status, paper_state
  FROM public.people_directory WHERE display_name = 'Pete Rusk';

\echo '--- 3. the shipped inline add, on Aspen Loft Refresh (projects.studio_id IS NULL) ---'
INSERT INTO public.project_parties
  (project_id, party_kind, display_name, company_name, trade, phone, email,
   sms_consent_status, studio_contact_id, show_to_client)
VALUES ('b0000000-0000-0000-0000-0000000000d1','sub','Pete Rusk','Rusk Mechanical',
        'plumbing','+16125550112', NULL,'not_asked', NULL, false);
SELECT id, studio_contact_id, phone_e164 FROM public.project_parties
 WHERE project_id = 'b0000000-0000-0000-0000-0000000000d1';

\echo '--- 4. AFTER: two rows for one human, two different consent words ---'
SELECT person_id, role, display_name, seat_count, consent_status, paper_state, project_id
  FROM public.people_directory WHERE display_name = 'Pete Rusk' ORDER BY role;
SELECT count(*) AS directory_rows FROM public.people_directory;

\echo '--- 5. why: the guessed studio holds no record for that number ---'
SELECT public.project_recorded_studio('b0000000-0000-0000-0000-0000000000d1') AS recorded,
       public.project_consent_org('b0000000-0000-0000-0000-0000000000d1')      AS guessed,
       public.channel_consent_status(
         public.project_consent_org('b0000000-0000-0000-0000-0000000000d1'),
         'sms','+16125550112')                                                 AS word_at_guessed,
       public.channel_consent_status(
         'b0000000-0000-0000-0000-000000000001','sms','+16125550112')          AS word_at_working_studio;
ROLLBACK;
