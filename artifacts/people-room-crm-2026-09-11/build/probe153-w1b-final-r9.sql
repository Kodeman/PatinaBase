\pset pager off
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p uuid) RETURNS void AS $$
BEGIN PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated'; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- a SECOND design studio of the same designer, with its own admin Z
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('a0000000-0000-0000-0000-000000000005','76db060f-0654-4502-94b1-00000c4e8dd3','member','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role='member', status='active';
-- a card in THAT studio
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, created_by)
VALUES ('ab000000-0000-4000-8000-000000000001','76db060f-0654-4502-94b1-00000c4e8dd3','person','sub','Foreign Card Person','a0000000-0000-0000-0000-000000000004');

\echo '=== BEFORE: Ngozi Eze on Okonkwo, as the studio ADMIN ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
SELECT 'directory rows for Ngozi' q, count(*)::text v FROM public.people_directory WHERE display_name='Ngozi Eze';
SELECT 'seats for Ngozi'          q, count(*)::text v FROM public.people_directory_seats WHERE display_name='Ngozi Eze';
SELECT 'roster rows for Ngozi'    q, count(*)::text v FROM public.v_project_roster     WHERE display_name='Ngozi Eze';
SELECT pg_temp.reset_role();

\echo '=== the write: the DESIGNER (owner of both studios) re-stamps the seat with the OTHER studio''s card ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
UPDATE public.project_parties
   SET studio_contact_id='ab000000-0000-4000-8000-000000000001'
 WHERE project_id='d0e00000-0000-0000-0000-00000000000a' AND display_name='Ngozi Eze';
SELECT pg_temp.reset_role();
SELECT 'rows re-stamped' q, count(*)::text v FROM public.project_parties
 WHERE studio_contact_id='ab000000-0000-4000-8000-000000000001';

\echo '=== AFTER: what the studio ADMIN of the studio DOING THE WORK now reads ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
SELECT 'directory rows for Ngozi' q, count(*)::text v FROM public.people_directory WHERE display_name='Ngozi Eze';
SELECT 'seats for Ngozi'          q, count(*)::text v FROM public.people_directory_seats WHERE display_name='Ngozi Eze';
SELECT 'roster rows for Ngozi'    q, count(*)::text v FROM public.v_project_roster     WHERE display_name='Ngozi Eze';
SELECT 'Ngozi seat row: person_id / consent / paper' q,
       format('%s | %s | %s', s.person_id, coalesce(s.consent_status,'<null>'), s.paper_state) v
  FROM public.people_directory_seats s WHERE s.display_name='Ngozi Eze';
SELECT 'orphan seats now' q, count(*)::text v
  FROM (SELECT DISTINCT person_id FROM public.people_directory_seats) s
 WHERE NOT EXISTS (SELECT 1 FROM public.people_directory d WHERE d.person_id=s.person_id);
SELECT 'site access card key holder still names her seat' q,
       (c.key_holder_engagement_id = s.seat_id)::text v
  FROM public.project_site_access_cards c, public.people_directory_seats s
 WHERE s.display_name='Ngozi Eze';
SELECT pg_temp.reset_role();

\echo '=== and what Z (the OTHER studio) reads of her ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
SELECT 'Z directory rows for the foreign card' q, count(*)::text v FROM public.people_directory WHERE display_name='Foreign Card Person';
SELECT 'Z seat_count claimed on that row' q, coalesce(max(seat_count)::text,'-') v FROM public.people_directory WHERE display_name='Foreign Card Person';
SELECT 'Z seats nested under it' q, count(*)::text v FROM public.people_directory_seats s
  JOIN public.people_directory d ON d.person_id=s.person_id WHERE d.display_name='Foreign Card Person';
SELECT 'Z consent word on that row' q, coalesce(max(consent_status),'<null>') v FROM public.people_directory WHERE display_name='Foreign Card Person';
SELECT pg_temp.reset_role();
ROLLBACK;
