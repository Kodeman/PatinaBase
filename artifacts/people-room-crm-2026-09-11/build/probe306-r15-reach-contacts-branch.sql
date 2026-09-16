-- W1b final review r15 MAJOR-2: reach_state_for() (00626:624-648), the CONTACTS
-- branch's reach reducer, carries no tenant predicate. A live field link minted
-- by another studio decides this studio's reach word. Rolled back.
\pset pager off
BEGIN;
SET LOCAL role postgres;
INSERT INTO public.projects (id, name, designer_id, studio_id, status, created_by)
VALUES ('aaaa1111-0000-4000-8000-000000000001','P306 Leah job',
        'a0000000-0000-0000-0000-000000000004','29a5162a-f4d8-4d16-bb1d-79c5da4e635c','active',
        'a0000000-0000-0000-0000-000000000004');
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, full_name, contact_kind, phone_e164)
VALUES ('aaaa2222-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','person','P306 Shared Human','trade','+16125556611');
-- the pre-00624 shape: a seat on ANOTHER studio's project stamped with THIS studio's card.
-- assert_project_party_cards_trg refuses it for every live write path, which is the point —
-- the population is legacy rows, and 00624:724-739's preflight is what would size it on Strata.
ALTER TABLE public.project_parties DISABLE TRIGGER assert_project_party_cards_trg;
ALTER TABLE public.project_parties DISABLE TRIGGER apply_party_rolodex_link_trg;
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone_e164, studio_contact_id)
VALUES ('aaaa3333-0000-4000-8000-000000000001','aaaa1111-0000-4000-8000-000000000001','sub',
        'P306 Shared Human','+16125556611','aaaa2222-0000-4000-8000-000000000001');
ALTER TABLE public.project_parties ENABLE TRIGGER assert_project_party_cards_trg;
ALTER TABLE public.project_parties ENABLE TRIGGER apply_party_rolodex_link_trg;
INSERT INTO public.field_link_tokens (party_id, project_id, token_hash, expires_at, status)
VALUES ('aaaa3333-0000-4000-8000-000000000001','aaaa1111-0000-4000-8000-000000000001',
        repeat('a',64), now() + interval '30 days','active');
\echo '-- as studio_manager@patina.dev: ADMIN of Local Dev Studio, NOT a member of Leah Hartwell --'
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT public.is_active_studio_member('29a5162a-f4d8-4d16-bb1d-79c5da4e635c') AS member_of_leah,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_localdev;
SELECT 'seats nested under the card' AS what, count(*)::text AS n FROM public.people_directory_seats
 WHERE person_id='aaaa2222-0000-4000-8000-000000000001'
UNION ALL SELECT 'foreign seat readable raw', count(*)::text FROM public.project_parties WHERE id='aaaa3333-0000-4000-8000-000000000001'
UNION ALL SELECT 'foreign link readable raw', count(*)::text FROM public.field_link_tokens WHERE party_id='aaaa3333-0000-4000-8000-000000000001'
UNION ALL SELECT 'reach_state_for(card)', public.reach_state_for(NULL,'aaaa2222-0000-4000-8000-000000000001',NULL);
SELECT display_name, role, reach_state, seat_count FROM public.people_directory
 WHERE person_id='aaaa2222-0000-4000-8000-000000000001';
ROLLBACK;
