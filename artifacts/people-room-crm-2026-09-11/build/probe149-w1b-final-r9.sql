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

\echo '=== what Z (designer second design studio) reads in v_access_grants ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
SELECT tier, count(*), string_agg(DISTINCT scope_type, ',') FROM public.v_access_grants GROUP BY 1 ORDER BY 1;
\echo '=== and which Directory rows ==='
SELECT role, count(*) FROM public.people_directory GROUP BY 1 ORDER BY 1;
\echo '=== does Z see any field_link tier? ==='
SELECT count(*) AS field_link_rows FROM public.v_access_grants WHERE tier='field_link';
SELECT pg_temp.reset_role();

\echo '=== OWNER: seat_count vs actually-nested seats, every directory row ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
WITH d AS (SELECT person_id, role, display_name, seat_count FROM public.people_directory),
     s AS (SELECT person_id, count(*) n FROM public.people_directory_seats GROUP BY 1)
SELECT d.role, d.display_name, d.seat_count, COALESCE(s.n,0) AS nested
  FROM d LEFT JOIN s ON s.person_id = d.person_id
 WHERE d.seat_count <> COALESCE(s.n,0)
 ORDER BY 1,2;
SELECT 'OWNER rows where seat_count <> nested' q, count(*)::text v FROM (
  WITH d AS (SELECT person_id, seat_count FROM public.people_directory),
       s AS (SELECT person_id, count(*) n FROM public.people_directory_seats GROUP BY 1)
  SELECT 1 FROM d LEFT JOIN s ON s.person_id=d.person_id WHERE d.seat_count <> COALESCE(s.n,0)) z;
SELECT 'OWNER orphan seats (person_id not in directory)' q, count(*)::text v
  FROM (SELECT DISTINCT person_id FROM public.people_directory_seats) s
 WHERE NOT EXISTS (SELECT 1 FROM public.people_directory d WHERE d.person_id = s.person_id);
SELECT pg_temp.reset_role();

\echo '=== ADMIN: same two invariants ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
SELECT 'ADMIN rows where seat_count <> nested' q, count(*)::text v FROM (
  WITH d AS (SELECT person_id, seat_count FROM public.people_directory),
       s AS (SELECT person_id, count(*) n FROM public.people_directory_seats GROUP BY 1)
  SELECT 1 FROM d LEFT JOIN s ON s.person_id=d.person_id WHERE d.seat_count <> COALESCE(s.n,0)) z;
SELECT 'ADMIN orphan seats' q, count(*)::text v
  FROM (SELECT DISTINCT person_id FROM public.people_directory_seats) s
 WHERE NOT EXISTS (SELECT 1 FROM public.people_directory d WHERE d.person_id = s.person_id);
SELECT pg_temp.reset_role();

\echo '=== OWNER: Directory consent word vs the record, number by number ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
WITH recs AS (
  SELECT scc.channel_value,
         public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms',scc.channel_value) AS verdict
    FROM public.studio_channel_consent scc
   WHERE scc.organization_id='b0000000-0000-0000-0000-000000000001' AND scc.channel_kind='sms'
)
SELECT r.channel_value, r.verdict AS record_says,
       (SELECT string_agg(DISTINCT COALESCE(d.consent_status,'<null>'), ',')
          FROM public.people_directory d
         WHERE d.meta->>'entity_kind'='person'
           AND public.identity_phone_numbers('b0000000-0000-0000-0000-000000000001', d.person_id::text, NULL)
               IS NOT NULL) AS ignore_me
  FROM recs r ORDER BY 1;
-- direct: for each carded person, the identity word vs the worst of its numbers
SELECT d.display_name, d.consent_status AS directory_word,
       (SELECT string_agg(n || '=' || COALESCE(public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms',n),'<norec>'), ' ')
          FROM public.identity_phone_numbers('b0000000-0000-0000-0000-000000000001', d.person_id::text,
                (SELECT sc.phone_e164 FROM public.studio_contacts sc WHERE sc.id=d.person_id)) n) AS per_number
  FROM public.people_directory d
 WHERE d.role='contact'
   AND d.consent_status IS NOT NULL
 ORDER BY 1;
SELECT pg_temp.reset_role();
ROLLBACK;
