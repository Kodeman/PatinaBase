\pset pager off
BEGIN;
SET LOCAL role postgres;
\echo '=== the fixture refusal ==='
SELECT organization_id, channel_value, status, opt_out_at IS NOT NULL AS dated, refusal_unanswered
  FROM public.studio_channel_consent
 WHERE organization_id='b0000000-0000-0000-0000-000000000001' AND status='opted_out';

\echo ''
\echo '=== 1. a CARD-ONLY identity (no seats) carrying a refused number ==='
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, full_name, contact_kind, phone, phone_e164)
VALUES ('eeee0000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','person',
        'P303 Card Only','trade','(612) 555-0112','+16125550112');

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
\echo '-- BEFORE: what the room says --'
SELECT display_name, phone, consent_status, seat_count FROM public.people_directory
 WHERE person_id='eeee0000-0000-4000-8000-000000000001';

\echo '-- the ordinary member edit: correct the number (PATCH /rest/v1/studio_contacts) --'
UPDATE public.studio_contacts
   SET phone='(612) 555-7777', phone_e164='+16125557777'
 WHERE id='eeee0000-0000-4000-8000-000000000001';

\echo '-- AFTER --'
SELECT display_name, phone, consent_status, seat_count FROM public.people_directory
 WHERE person_id='eeee0000-0000-4000-8000-000000000001';
\echo '-- and the record itself --'
SET LOCAL role postgres;
SELECT channel_value, status FROM public.studio_channel_consent
 WHERE organization_id='b0000000-0000-0000-0000-000000000001'
   AND channel_value IN ('+16125550112','+16125557777') ORDER BY 1;

\echo ''
\echo '=== 2. the same edit on a card that HOLDS a seat carrying the refused number ==='
SELECT pp.id AS seat_id, pp.display_name, pp.phone_e164, pp.studio_contact_id, pj.name AS project
  FROM public.project_parties pp JOIN public.projects pj ON pj.id=pp.project_id
 WHERE pp.phone_e164='+16125550112';
ROLLBACK;
