-- W1b final review r15 MAJOR-1: assert_studio_contact_identity_stable()
-- (00593:502-585) does not count project_parties.studio_contact_id as a holder,
-- so a card carrying seat stamps moves studio on one ordinary member PATCH.
-- Every write below is an ordinary authenticated write. Rolled back.
\pset pager off
BEGIN;
SET LOCAL role postgres;
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, full_name, contact_kind, phone, phone_e164, created_by)
VALUES ('bbbb1111-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','person',
        'P307 Fresh Card','trade','(612) 555-6622','+16125556622','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone)
SELECT 'bbbb2222-0000-4000-8000-000000000001', pj.id,'sub','P307 Fresh Card','(612) 555-6622'
  FROM public.projects pj WHERE pj.studio_id='b0000000-0000-0000-0000-000000000001' ORDER BY pj.name LIMIT 1;
\echo '-- 00626 §1b auto-linked the seat to the card --'
SELECT id::text, studio_contact_id, phone_e164 FROM public.project_parties WHERE id='bbbb2222-0000-4000-8000-000000000001';
INSERT INTO public.studio_channel_consent (organization_id, channel_kind, channel_value, status,
  opt_out_at, opt_out_source, opt_out_evidence, opt_out_recorded_at, refusal_unanswered)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125556622','opted_out', now(),'inbound_sms','Replied STOP', now(), false);

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
\echo '-- BEFORE: the Local Dev Studio room --'
SELECT display_name, role, consent_status, reach_state, seat_count FROM public.people_directory
 WHERE person_id='bbbb1111-0000-4000-8000-000000000001';
SELECT display_name, project_name, consent_status FROM public.people_directory_seats
 WHERE seat_id='bbbb2222-0000-4000-8000-000000000001';

\echo '-- one PATCH /rest/v1/studio_contacts: organization_id -> the designer''s OTHER studio --'
DO $$ BEGIN
  UPDATE public.studio_contacts SET organization_id='29a5162a-f4d8-4d16-bb1d-79c5da4e635c'
   WHERE id='bbbb1111-0000-4000-8000-000000000001';
  RAISE NOTICE 'CARD MOVED TO THE SECOND STUDIO — no guard fired';
EXCEPTION WHEN others THEN RAISE NOTICE 'REFUSED: %', SQLERRM; END $$;

\echo '-- AFTER, as the WORKING studio''s admin (studio_manager@patina.dev) --'
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT 'localdev admin: directory rows for the card' AS what, count(*)::text AS n FROM public.people_directory WHERE person_id='bbbb1111-0000-4000-8000-000000000001'
UNION ALL SELECT 'localdev admin: seat rows still nesting under it', count(*)::text FROM public.people_directory_seats WHERE person_id='bbbb1111-0000-4000-8000-000000000001'
UNION ALL SELECT 'localdev admin: can it read the card at all', count(*)::text FROM public.studio_contacts WHERE id='bbbb1111-0000-4000-8000-000000000001'
UNION ALL SELECT 'localdev admin: seat consent word', COALESCE((SELECT consent_status FROM public.people_directory_seats WHERE seat_id='bbbb2222-0000-4000-8000-000000000001'),'(null)');

\echo '-- AFTER, as designer@patina.dev, a member of BOTH studios: the row and its own seat line --'
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT 'identity row' AS line, d.display_name, d.consent_status AS word, d.seat_count::text AS detail
  FROM public.people_directory d WHERE d.person_id='bbbb1111-0000-4000-8000-000000000001';
SELECT 'seat line beneath it' AS line, s.display_name, s.consent_status AS word, s.project_name AS detail
  FROM public.people_directory_seats s WHERE s.person_id='bbbb1111-0000-4000-8000-000000000001';
SET LOCAL role postgres;
SELECT 'the record still says' AS what, organization_id, status FROM public.studio_channel_consent WHERE channel_value='+16125556622';
SELECT 'seats stamped with this card (the holder the guard does not count)' AS holder, count(*)
  FROM public.project_parties WHERE studio_contact_id='bbbb1111-0000-4000-8000-000000000001';
ROLLBACK;
