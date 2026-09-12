-- ═══════════════════════════════════════════════════════════════════════════
-- probe116 — W1b final review r5 FIXES, negative control
--
-- Re-walks the reviewer's probe107 (MAJOR-1) and probe109 (MAJOR-3) after the
-- r5 fixes. Those two files hard-code the seed's second studio id
-- ('e1c06557-8536-421a-8a10-83e7ce8c22ab'), which is minted at seed time and
-- is a different uuid after every `supabase:reset`, so they cannot replay
-- verbatim; the org is resolved here instead. probe105 (BLOCKING-1) and
-- probe108 (MAJOR-2) DO replay verbatim and were run unchanged.
--
-- The shape under test: designer@patina.dev belongs to Local Dev Studio AND to
-- a second studio. One ordinary member of that second studio is a
-- co-member of the designer of record (is_studio_comember true) and is NOT an
-- active member of Local Dev Studio. Before the fix they read 31 seat rows,
-- 11 authority grants and the site access card, changed the lockbox version,
-- and saw every consent word as `not_asked` over records that say opted_out.
--
-- Local Postgres only. Every act is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
\pset pager off
BEGIN;

SELECT organization_id AS side_org
  FROM public.organization_members
 WHERE user_id = 'a0000000-0000-0000-0000-000000000004'
   AND status = 'active'
   AND organization_id <> 'b0000000-0000-0000-0000-000000000001'
 LIMIT 1
\gset

\echo '=== the side studio this run resolved (minted at seed time) ==='
SELECT :'side_org' AS side_org,
       (SELECT name FROM public.organizations WHERE id = :'side_org') AS side_org_name;

INSERT INTO auth.users (id, email, aud, role, instance_id)
VALUES ('cc000000-0000-4000-8000-0000000000c1','sidestudio@patina.invalid',
        'authenticated','authenticated','00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, role)
VALUES ('cc000000-0000-4000-8000-0000000000c1','sidestudio@patina.invalid','designer')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('cc000000-0000-4000-8000-0000000000c1', :'side_org','member','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET status='active';

-- Local Dev Studio records a refusal on the one uncarded party-branch identity
INSERT INTO public.studio_channel_consent
  (organization_id, channel_kind, channel_value, status, opt_out_at, opt_out_source,
   opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125550219','opted_out', now(),
        'verbal','said stop on site', now(),'a0000000-0000-0000-0000-000000000004')
ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE
  SET status = 'opted_out', opt_out_at = now();

\echo '=== the records, as postgres ==='
SELECT organization_id, channel_value, status,
       public.channel_consent_status(organization_id,'sms',channel_value) AS verdict
  FROM public.studio_channel_consent
 WHERE organization_id='b0000000-0000-0000-0000-000000000001'
   AND channel_value IN ('+16125550112','+16125550219')
 ORDER BY channel_value;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"cc000000-0000-4000-8000-0000000000c1","role":"authenticated"}';

\echo '=== the side-studio member: co-member of the Local Dev designer, NOT a member of Local Dev Studio ==='
SELECT public.is_studio_comember('a0000000-0000-0000-0000-000000000004') AS comember_of_the_designer,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_local_dev_studio;

\echo '=== MAJOR-1: the seat rows they read of Local Dev Studio (was 31) ==='
SELECT count(*) AS seat_rows_they_read FROM public.people_directory_seats;
SELECT count(*) AS party_branch_directory_rows FROM public.people_directory WHERE role <> 'contact';
SELECT display_name, phone_e164, consent_status
  FROM public.people_directory_seats
 WHERE phone_e164 IN ('+16125550112','+16125550219') ORDER BY display_name;

\echo '=== MAJOR-3: the sensitive objects (was 1 card / 11 grants) ==='
SELECT 'studio_compliance_documents' o, count(*) FROM public.studio_compliance_documents
UNION ALL SELECT 'people_directory contacts branch', count(*) FROM public.people_directory WHERE role='contact'
UNION ALL SELECT 'project_party_authority', count(*) FROM public.project_party_authority
UNION ALL SELECT 'project_site_access_cards', count(*) FROM public.project_site_access_cards;

\echo '=== the site access card itself (was the lockbox version, the alarm account, six lines) ==='
SELECT project_id, lockbox_version, alarm_ref FROM public.project_site_access_cards;

\echo '=== can they WRITE, too? (an UPDATE landed on 1 row before the fix) ==='
DO $$
BEGIN
  UPDATE public.project_site_access_cards SET lockbox_version = 'changed by a foreign studio';
  RAISE NOTICE 'UPDATE landed on % row(s)', (SELECT count(*) FROM public.project_site_access_cards WHERE lockbox_version='changed by a foreign studio');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'UPDATE refused: % (%)', SQLERRM, SQLSTATE; END $$;

\echo '=== THE POSITIVE CONTROL: the OWNER of Local Dev Studio still reads all of it, refusal included ==='
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT 'people_directory_seats' o, count(*) FROM public.people_directory_seats
UNION ALL SELECT 'project_party_authority', count(*) FROM public.project_party_authority
UNION ALL SELECT 'project_site_access_cards', count(*) FROM public.project_site_access_cards
UNION ALL SELECT 'people_directory', count(*) FROM public.people_directory;
SELECT display_name, phone_e164, consent_status
  FROM public.people_directory_seats
 WHERE phone_e164 IN ('+16125550112','+16125550219') ORDER BY display_name, phone_e164;
SELECT lockbox_version, alarm_ref FROM public.project_site_access_cards;

ROLLBACK;
