-- ═══════════════════════════════════════════════════════════════════════════
-- probe107 — W1b final review r5, MAJOR-1
-- r4 MAJOR-3's fix makes identity_consent_status() authoritative only for a
-- caller who is an ACTIVE MEMBER of the seat's consent studio. Seat VISIBILITY
-- is is_studio_comember(designer_id) (00626:1028-1030, :1288-1290) — the
-- brief's own predicate — which is satisfied by sharing ANY active org with the
-- designer of record. A designer who belongs to two studios therefore hands
-- every member of the SECOND studio the first studio's seats, and for those
-- callers:
--   · identity_phone_numbers()'s gate returns no numbers  -> NULL -> 'not_asked'
--   · channel_consent_status() reads 0 rows under RLS      -> NULL -> 'not_asked'
-- so both the Directory's party branch (00626:1001-1003) and
-- people_directory_seats.consent_status (00626:1270-1272) print `not_asked`
-- over a record that says `opted_out`.
-- designer@patina.dev owns BOTH "Local Dev Studio" and "Leah Hartwell" in the
-- shipped local seed, so the shape needs no contrivance beyond one member.
-- Local Postgres only. Every act is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
\pset pager off
BEGIN;

INSERT INTO auth.users (id, email, aud, role, instance_id)
VALUES ('cc000000-0000-4000-8000-0000000000c1','sidestudio@patina.invalid',
        'authenticated','authenticated','00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, role)
VALUES ('cc000000-0000-4000-8000-0000000000c1','sidestudio@patina.invalid','designer')
ON CONFLICT (id) DO NOTHING;
-- a member of ONLY the second studio designer@patina.dev belongs to
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('cc000000-0000-4000-8000-0000000000c1','e1c06557-8536-421a-8a10-83e7ce8c22ab',
        'member','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET status='active';

-- Local Dev Studio records a refusal on the one uncarded party-branch identity
INSERT INTO public.studio_channel_consent
  (organization_id, channel_kind, channel_value, status, opt_out_at, opt_out_source,
   opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125550219','opted_out', now(),
        'verbal','said stop on site', now(),'a0000000-0000-0000-0000-000000000004');

\echo '=== the record, as postgres ==='
SELECT organization_id, channel_value, status,
       public.channel_consent_status(organization_id,'sms',channel_value) AS verdict
  FROM public.studio_channel_consent WHERE channel_value IN ('+16125550219','+16125550112')
 ORDER BY channel_value;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"cc000000-0000-4000-8000-0000000000c1","role":"authenticated"}';

\echo '=== the side-studio member: co-member of the Local Dev designer, NOT a member of Local Dev Studio ==='
SELECT public.is_studio_comember('a0000000-0000-0000-0000-000000000004') AS comember_of_the_designer,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_local_dev_studio;

\echo '=== and yet they read 31 of Local Dev Studio seat rows ==='
SELECT count(*) AS seat_rows_they_read FROM public.people_directory_seats;

\echo '=== the word they read, over a record that says opted_out ==='
SELECT display_name, role, status_raw, consent_status, meta->>'sms_consent_status' AS meta_word
  FROM public.people_directory WHERE display_name='Rivera Finishes' ORDER BY role;
SELECT display_name, phone_e164, consent_status FROM public.people_directory_seats
 WHERE phone_e164 IN ('+16125550219','+16125550112') ORDER BY display_name, phone_e164;

\echo '=== the control: the OWNER of Local Dev Studio reads the record honestly ==='
SET LOCAL "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT display_name, role, status_raw, consent_status FROM public.people_directory
 WHERE display_name='Rivera Finishes' ORDER BY role;
SELECT display_name, phone_e164, consent_status FROM public.people_directory_seats
 WHERE phone_e164 IN ('+16125550219','+16125550112') ORDER BY display_name, phone_e164;

ROLLBACK;
