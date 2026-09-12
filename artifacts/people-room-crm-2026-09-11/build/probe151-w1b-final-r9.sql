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
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('a0000000-0000-0000-0000-000000000005','76db060f-0654-4502-94b1-00000c4e8dd3','member','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role='member', status='active';

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
\echo '=== OWNER: v_project_roster word vs 00626 seat word, same seat ==='
SELECT r.display_name, r.sms_consent_status AS roster_word, s.consent_status AS seats_word, s.project_name
  FROM public.v_project_roster r
  JOIN public.people_directory_seats s ON s.seat_id = r.roster_id
 WHERE r.source='party'
   AND COALESCE(r.sms_consent_status,'<null>') IS DISTINCT FROM COALESCE(s.consent_status,'<null>')
 ORDER BY 1;
\echo '=== OWNER: paper word consistency ==='
SELECT d.display_name, d.paper_state,
       public.compliance_state(d.person_id) AS own_card,
       COALESCE(public.compliance_state((d.meta->>'company_id')::uuid),'<no firm>') AS firm
  FROM public.people_directory d
 WHERE d.role='contact'
   AND d.paper_state IS DISTINCT FROM public.identity_paper_state(d.person_id, (d.meta->>'company_id')::uuid)
 ORDER BY 1;
\echo '=== OWNER: the four paper words as seen, and their sources ==='
SELECT d.display_name, d.paper_state, public.compliance_state(d.person_id) AS own_card,
       COALESCE(public.compliance_state((d.meta->>'company_id')::uuid),'-') AS firm
  FROM public.people_directory d WHERE d.role='contact' AND d.paper_state <> 'not_on_file' ORDER BY 2,1;
SELECT pg_temp.reset_role();

\echo '=== Z: v_project_roster consent word on the studio doing the work (r8 MAJOR-1) ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
SELECT r.display_name, COALESCE(r.sms_consent_status,'<null>') AS roster_word, r.source
  FROM public.v_project_roster r
 WHERE r.project_id='d0e00000-0000-0000-0000-00000000000a' AND r.source='party'
 ORDER BY 1 LIMIT 8;
SELECT 'Z roster rows on Okonkwo' q, count(*)::text v FROM public.v_project_roster WHERE project_id='d0e00000-0000-0000-0000-00000000000a';
SELECT 'Z non-null roster consent words anywhere' q, count(*)::text v FROM public.v_project_roster WHERE sms_consent_status IS NOT NULL;
SELECT pg_temp.reset_role();

\echo '=== anon: what does people_directory / the new objects give? ==='
SET LOCAL ROLE anon;
SELECT 'anon people_directory rows' q, count(*)::text v FROM public.people_directory;
RESET ROLE;
ROLLBACK;
