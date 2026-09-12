\set ON_ERROR_STOP on
BEGIN;
-- A second member who is the designer of record on one job.
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,aud,role)
VALUES ('a0000000-0000-0000-0000-0000000000f2','leaver@patina.dev','x',now(),'authenticated','authenticated');
UPDATE public.profiles SET full_name='Leaver Designer' WHERE id='a0000000-0000-0000-0000-0000000000f2';
INSERT INTO public.organization_members (organization_id,user_id,role,status)
VALUES ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000f2','member','active');

-- his job, in the same studio
INSERT INTO public.projects (id,name,designer_id,created_by,studio_id,status)
VALUES ('99000000-0000-4000-8000-0000000000f2','Leaver job','a0000000-0000-0000-0000-0000000000f2','a0000000-0000-0000-0000-0000000000f2',
        'b0000000-0000-0000-0000-000000000001','active');

-- a rolodex card whose OFFICE line is permitted
INSERT INTO public.studio_contacts (id,organization_id,entity_kind,full_name,contact_kind,created_by,phone,phone_e164)
VALUES ('cc000000-0000-4000-8000-0000000000f2','b0000000-0000-0000-0000-000000000001','person',
        'Two Line Trade','trade','a0000000-0000-0000-0000-000000000004','612-555-9001','+16125559001');
INSERT INTO public.studio_channel_consent
  (organization_id,channel_kind,channel_value,status,consented_at,source,recorded_at)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125559001','granted',now(),'written',now());

-- and his MOBILE, which said STOP, carried only by a seat on the leaver's job
INSERT INTO public.project_parties (id,project_id,party_kind,display_name,studio_contact_id,phone,phone_e164,trade)
VALUES ('aa000000-0000-4000-8000-0000000000f2','99000000-0000-4000-8000-0000000000f2','sub',
        'Two Line Trade','cc000000-0000-4000-8000-0000000000f2','612-555-9002','+16125559002','tile');
INSERT INTO public.studio_channel_consent
  (organization_id,channel_kind,channel_value,status,opt_out_at,opt_out_source,recorded_at)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125559002','opted_out',now(),'inbound_sms',now());

\echo '=== F1: the record, as the studio holds it ==='
SELECT channel_value, status FROM public.studio_channel_consent
 WHERE channel_value IN ('+16125559001','+16125559002') ORDER BY 1;

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
\echo '=== F2: while the leaver is still a member, the owner reads the honest word ==='
SELECT display_name, consent_status, seat_count FROM public.people_directory
 WHERE person_id='cc000000-0000-4000-8000-0000000000f2';
SELECT display_name, project_name, phone_e164, consent_status FROM public.people_directory_seats
 WHERE person_id='cc000000-0000-4000-8000-0000000000f2';

RESET role;
\echo '=== F3: the leaver leaves the studio (an ordinary act) ==='
UPDATE public.organization_members SET status='removed'
 WHERE user_id='a0000000-0000-0000-0000-0000000000f2'
   AND organization_id='b0000000-0000-0000-0000-000000000001';

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
\echo '=== F4: what the owner now reads for the same card, over the same record ==='
SELECT display_name, consent_status, reach_state, seat_count FROM public.people_directory
 WHERE person_id='cc000000-0000-4000-8000-0000000000f2';
SELECT display_name, project_name, phone_e164, consent_status FROM public.people_directory_seats
 WHERE person_id='cc000000-0000-4000-8000-0000000000f2';
\echo '=== F5: the record itself is unchanged and still says opted_out ==='
RESET role;
SELECT channel_value, status FROM public.studio_channel_consent
 WHERE channel_value='+16125559002';
SELECT public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms','+16125559002') AS record_verdict;
ROLLBACK;
