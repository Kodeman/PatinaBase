\set ON_ERROR_STOP on
BEGIN;
-- one identity (keyed on a LOGIN), two seats, two numbers:
--  the NEWER (winning) seat's number is granted and dated
--  the OLDER seat's number carries the refusal
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,aud,role)
VALUES ('a0000000-0000-0000-0000-000000000cc1','twonum@patina.dev','x',now(),'authenticated','authenticated');
INSERT INTO public.profiles (id,email,full_name) VALUES ('a0000000-0000-0000-0000-000000000cc1','twonum@patina.dev','Two Num Trade')
ON CONFLICT (id) DO UPDATE SET full_name='Two Num Trade';

INSERT INTO public.project_parties (id,project_id,party_kind,display_name,profile_id,phone,phone_e164,trade,updated_at)
SELECT 'aa000000-0000-4000-8000-000000000cc1', pj.id,'sub','Two Num Trade',
       'a0000000-0000-0000-0000-000000000cc1','612-555-9101','+16125559101','tile', now() - interval '2 days'
  FROM public.projects pj WHERE pj.name='Okonkwo residence';
INSERT INTO public.project_parties (id,project_id,party_kind,display_name,profile_id,phone,phone_e164,trade,updated_at)
SELECT 'aa000000-0000-4000-8000-000000000cc2', pj.id,'sub','Two Num Trade',
       'a0000000-0000-0000-0000-000000000cc1','612-555-9102','+16125559102','tile', now()
  FROM public.projects pj WHERE pj.name='Okonkwo residence';

INSERT INTO public.studio_channel_consent
  (organization_id,channel_kind,channel_value,status,opt_out_at,opt_out_source,recorded_at)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125559101','opted_out',
        '2025-12-03'::timestamptz,'inbound_sms',now());
INSERT INTO public.studio_channel_consent
  (organization_id,channel_kind,channel_value,status,consented_at,source,recorded_at)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125559102','granted',
        '2025-05-02'::timestamptz,'written',now());

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
\echo '=== K1: the one Directory row — its word, and the two dates it carries ==='
SELECT display_name, consent_status, status_raw,
       meta->>'phone_e164'       AS winning_number,
       meta->>'sms_consented_at' AS consented_at,
       meta->>'sms_opt_out_at'   AS opt_out_at,
       seat_count
  FROM public.people_directory
 WHERE person_id IN ('aa000000-0000-4000-8000-000000000cc1','aa000000-0000-4000-8000-000000000cc2');
\echo '=== K2: the record, per number ==='
RESET role;
SELECT channel_value, status, consented_at::date, opt_out_at::date
  FROM public.studio_channel_consent
 WHERE channel_value IN ('+16125559101','+16125559102') ORDER BY 1;
ROLLBACK;
