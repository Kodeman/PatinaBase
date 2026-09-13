-- w1b final review r13 · MAJOR-1, after the RULING
-- No code changed: letting rolodex_card_for_party_phone() fall back to
-- project_tenant_org() would put a CALLER-RELATIVE studio inside the identity
-- key, which is exactly the door r11 MAJOR-3 walked and closed. So the
-- studio-less population keeps the duplicate identity until R-BD's W3 backfill
-- names a studio, written into 00626's § beside the resolver, into
-- rolodex_card_for_party_phone()'s COMMENT, into 00624's preflight block and
-- into w1b-report.md §8.
-- This probe records the residue as it stands, and the two facts that bound it:
-- the duplicate never prints the affirmative consent word, and the send gate
-- refuses on the record's verdict before the invite carve-out.
\set ON_ERROR_STOP on
BEGIN;
\echo '--- 1. the deploy brief''s two counts, run locally ---'
SELECT count(*) AS studioless_projects FROM public.projects WHERE studio_id IS NULL;
SELECT count(*) AS studioless_projects_carrying_seats
  FROM public.projects pj
 WHERE pj.studio_id IS NULL
   AND EXISTS (SELECT 1 FROM public.project_parties pp WHERE pp.project_id = pj.id);
SELECT count(*) AS stamped_seats_off_their_project_studio
  FROM public.project_parties pp
  JOIN public.projects pj        ON pj.id = pp.project_id
  JOIN public.studio_contacts sc ON sc.id = pp.studio_contact_id
 WHERE pp.studio_contact_id IS NOT NULL
   AND (pj.studio_id IS NULL OR sc.organization_id <> pj.studio_id);

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
\echo '--- 2. BEFORE ---'
SELECT count(*) AS directory_rows FROM public.people_directory;
SELECT person_id, role, display_name, seat_count, consent_status, paper_state
  FROM public.people_directory WHERE display_name = 'Pete Rusk';

\echo '--- 3. the shipped inline add on Aspen Loft Refresh (projects.studio_id IS NULL) ---'
INSERT INTO public.project_parties
  (project_id, party_kind, display_name, company_name, trade, phone, email,
   sms_consent_status, studio_contact_id, show_to_client)
VALUES ('b0000000-0000-0000-0000-0000000000d1','sub','Pete Rusk','Rusk Mechanical',
        'plumbing','+16125550112', NULL,'not_asked', NULL, false);

\echo '--- 4. AFTER: the RULED residue — two rows, and never the affirmative word ---'
SELECT person_id, role, display_name, seat_count, consent_status, paper_state, project_id
  FROM public.people_directory WHERE display_name = 'Pete Rusk' ORDER BY role;
SELECT count(*) AS directory_rows FROM public.people_directory;
SELECT count(*) AS pete_rows_reading_granted FROM public.people_directory
 WHERE display_name = 'Pete Rusk' AND consent_status = 'granted';

\echo '--- 5. the record the send gate asks, at the studio doing the work ---'
SELECT public.channel_consent_status(
         'b0000000-0000-0000-0000-000000000001','sms','+16125550112') AS word_at_working_studio,
       public.channel_consent_status(
         public.project_consent_org('b0000000-0000-0000-0000-0000000000d1'),
         'sms','+16125550112')                                        AS word_at_guessed_studio;
ROLLBACK;
