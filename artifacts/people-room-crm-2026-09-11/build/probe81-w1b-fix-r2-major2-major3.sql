-- probe81 — w1b final review r2 MAJOR-2 (the consent word reads the card's
-- number alone) and MAJOR-3 (reach reads the winning seat's links alone),
-- each walked on the shape the seeded fixture cannot show, with the OLD
-- expression printed beside the new one as the negative control.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ── MAJOR-2 fixture: two carded humans in the SEEDED studio, on the seeded
--    Okonkwo job, whose card number is not the number their seat carries.
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, phone, company_id, created_by)
VALUES
  ('c8100000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','person','sub',
   'Two-Number Sub','(612) 555-7100','d0e20000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000004'),
  ('c8100000-0000-4000-8000-000000000002','b0000000-0000-0000-0000-000000000001','person','sub',
   'Emailonly Sub',NULL,'d0e20000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, phone, studio_contact_id, company_id, stage, created_by)
VALUES
  ('c8200000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a','sub',
   'Two-Number Sub','(612) 555-7200','c8100000-0000-4000-8000-000000000001',
   'd0e20000-0000-0000-0000-000000000003','active','a0000000-0000-0000-0000-000000000004'),
  ('c8200000-0000-4000-8000-000000000002','d0e00000-0000-0000-0000-00000000000a','sub',
   'Emailonly Sub','(612) 555-7001','c8100000-0000-4000-8000-000000000002',
   'd0e20000-0000-0000-0000-000000000003','active','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.studio_channel_consent
  (organization_id, channel_kind, channel_value, status, opt_out_at, opt_out_source,
   opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by)
VALUES
  ('b0000000-0000-0000-0000-000000000001','sms','+16125557200','opted_out', now(),'verbal',
   'said stop on site', now(),'a0000000-0000-0000-0000-000000000004'),
  ('b0000000-0000-0000-0000-000000000001','sms','+16125557001','opted_out', now(),'verbal',
   'said stop on site', now(),'a0000000-0000-0000-0000-000000000004');

-- ── MAJOR-3 fixture: an uncarded identity, two seats, the live door on the
--    seat the Directory does NOT point at.
INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, phone, stage, created_by, updated_at)
VALUES
  ('c8200000-0000-4000-8000-000000000011','d0e00000-0000-0000-0000-00000000000a','sub',
   'Two-Seat Tradesman','(612) 555-7311','warranty','a0000000-0000-0000-0000-000000000004','2026-01-01T00:00:00Z'),
  ('c8200000-0000-4000-8000-000000000012','d0e00000-0000-0000-0000-00000000000b','sub',
   'Two-Seat Tradesman','(612) 555-7311','active','a0000000-0000-0000-0000-000000000004','2026-06-01T00:00:00Z');
INSERT INTO public.field_link_tokens (party_id, project_id, token_hash, status, expires_at, created_by)
VALUES ('c8200000-0000-4000-8000-000000000011','d0e00000-0000-0000-0000-00000000000a',
        'probe81-identity-reach','active', now() + interval '30 days',
        'a0000000-0000-0000-0000-000000000004');

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

\echo '=== MAJOR-2. the identity row, the seat line, and the record ==='
SELECT display_name, role, phone, consent_status AS the_word_on_the_face
  FROM public.people_directory
 WHERE display_name IN ('Two-Number Sub','Emailonly Sub') ORDER BY display_name;
SELECT display_name, phone_e164, consent_status AS the_word_on_the_seat
  FROM public.people_directory_seats
 WHERE display_name IN ('Two-Number Sub','Emailonly Sub') ORDER BY display_name;
SELECT channel_value, status FROM public.studio_channel_consent
 WHERE channel_value IN ('+16125557100','+16125557200','+16125557001') ORDER BY channel_value;

\echo ''
\echo '    NEGATIVE CONTROL - what the OLD expression (the CARD number alone) answers:'
SELECT sc.full_name,
       CASE WHEN sc.phone_e164 IS NOT NULL
            THEN COALESCE(public.channel_consent_status(sc.organization_id,'sms',sc.phone_e164),'not_asked')
            END AS old_card_only_word,
       public.identity_consent_status(sc.organization_id, sc.id::text, sc.phone_e164) AS new_identity_word
  FROM public.studio_contacts sc
 WHERE sc.id IN ('c8100000-0000-4000-8000-000000000001','c8100000-0000-4000-8000-000000000002')
 ORDER BY sc.full_name;

\echo ''
\echo '=== MAJOR-3. the uncarded identity row, its seats, and the record ==='
SELECT display_name, role, seat_count, reach_state
  FROM public.people_directory WHERE display_name = 'Two-Seat Tradesman';
SELECT s.seat_id, s.project_name, s.stage, s.reach_state,
       EXISTS (SELECT 1 FROM public.field_link_tokens f
                WHERE f.party_id = s.seat_id AND f.status='active' AND f.expires_at > now())
         AS holds_a_live_link
  FROM public.people_directory_seats s
 WHERE s.display_name = 'Two-Seat Tradesman' ORDER BY s.project_name;

\echo ''
\echo '    NEGATIVE CONTROL — what the OLD expression (the WINNING seat alone) answers:'
SELECT pd.display_name,
       public.reach_state_for(NULL, NULL, pd.person_id)                 AS old_winning_seat_only,
       public.reach_state_for_identity(NULL, pd.meta->>'identity_key')  AS new_identity_reach
  FROM public.people_directory pd WHERE pd.display_name = 'Two-Seat Tradesman';

\echo ''
\echo '    and the invariant: no Directory row disagrees with the seat lines beneath it'
SELECT count(*) AS rows_where_reach_disagrees
  FROM public.people_directory pd
 WHERE pd.reach_state = 'on_paper'
   AND EXISTS (SELECT 1 FROM public.people_directory_seats s
                WHERE s.person_id = pd.person_id AND s.reach_state = 'field_link');
SELECT count(*) AS rows_where_consent_understates
  FROM public.people_directory pd
 WHERE pd.consent_status IS DISTINCT FROM 'opted_out'
   AND EXISTS (SELECT 1 FROM public.people_directory_seats s
                WHERE s.person_id = pd.person_id AND s.consent_status = 'opted_out');
ROLLBACK;
