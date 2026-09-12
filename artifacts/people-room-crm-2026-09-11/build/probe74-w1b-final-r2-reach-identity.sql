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

-- An UNCARDED human on two of the seeded studio's projects, same phone.
-- Seat OLD (Lindqvist, closed) carries a LIVE field link; seat NEW (Okonkwo) does not.
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, phone_e164, stage, updated_at)
VALUES ('cccc3333-0000-4000-8000-0000000000a1',
        (SELECT id FROM public.projects WHERE name='Lindqvist kitchen'),
        'sub','Two-Seat Tradesman','+16125559911','+16125559911','warranty', now() - interval '10 days'),
       ('cccc3333-0000-4000-8000-0000000000a2',
        (SELECT id FROM public.projects WHERE name='Okonkwo residence'),
        'sub','Two-Seat Tradesman','+16125559911','+16125559911','active', now());

-- a live, unexpired field link on the OLDER seat only
INSERT INTO public.field_link_tokens (party_id, project_id, token_hash, expires_at, status)
VALUES ('cccc3333-0000-4000-8000-0000000000a1',
        (SELECT id FROM public.projects WHERE name='Lindqvist kitchen'),
        repeat('a',64), now() + interval '60 days', 'active');

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
\echo '--- the Directory row for the uncarded two-seat identity ---'
SELECT display_name, role, person_id, seat_count, reach_state
  FROM public.people_directory WHERE display_name='Two-Seat Tradesman';
\echo '--- its seats, and which of them holds the live link ---'
SELECT s.seat_id, s.project_name, s.stage, s.reach_state,
       EXISTS (SELECT 1 FROM public.field_link_tokens f WHERE f.party_id=s.seat_id AND f.status='active' AND f.expires_at>now()) AS holds_a_live_link
  FROM public.people_directory_seats s WHERE s.display_name='Two-Seat Tradesman' ORDER BY s.project_name;
\echo '--- the record: does this human have a live field link at all? ---'
SELECT count(*) AS live_links_for_this_human
  FROM public.field_link_tokens f JOIN public.project_parties pp ON pp.id=f.party_id
 WHERE pp.phone_e164='+16125559911' AND f.status='active' AND f.expires_at>now();
SELECT pg_temp.reset_role();
ROLLBACK;
