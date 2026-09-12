-- probe92 — w1b final review r3:
--   (A) migrations MAJOR-1/r2 MINOR-24: a client/lead/maker/team Directory row
--       may not claim a seat_count it cannot nest. Walked as probe83 walked it:
--       PR-c's own client_rep seat, stamped with the household member's LOGIN,
--       inserted by a plain studio member.
--   (B) tests MAJOR-1: the PARTY branch's consent word is the IDENTITY's, not
--       the winning seat's. An identity keyed on a login holding two numbers,
--       the refusal on the NON-winning one.
-- Objects and access only; the ledger is never probed. BEGIN … ROLLBACK.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',p_user_id::text,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

\echo '=== A0: the whole-fixture invariant BEFORE the act ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
SELECT count(*) FILTER (WHERE pd.seat_count > 0 AND pd.seat_count <> (
          SELECT count(*) FROM public.people_directory_seats s
           WHERE s.person_id = pd.person_id)) AS rows_where_count_disagrees,
       count(*) AS total_rows
  FROM public.people_directory pd;

\echo '=== A1: the act — two login-stamped seats for the household member ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');  -- a plain member
INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, profile_id, email, stage, created_by)
VALUES
  ('aa000000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000b',
   'client_rep','Client User (rep seat)','a0000000-0000-0000-0000-000000000005',
   'client@patina.dev','active','a0000000-0000-0000-0000-000000000003'),
  ('aa000000-0000-4000-8000-000000000002','d0e00000-0000-0000-0000-00000000000b',
   'other','Client User (second rep seat)','a0000000-0000-0000-0000-000000000005',
   'client@patina.dev','active','a0000000-0000-0000-0000-000000000003');

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
\echo '--- the CLIENT Directory row for that household: claimed vs nested ---'
SELECT pd.role, pd.display_name, pd.person_id, pd.seat_count,
       (SELECT count(*) FROM public.people_directory_seats s
         WHERE s.person_id = pd.person_id) AS nested
  FROM public.people_directory pd
 WHERE pd.person_id = '573b2449-cd41-41cd-94db-747a1418c18e';

\echo '--- the NEGATIVE CONTROL: what the old expression claimed ---'
SELECT public.identity_seat_count('a0000000-0000-0000-0000-000000000005')
         AS old_seat_count_keyed_on_the_profile;

\echo '--- where those two seats nest ---'
SELECT person_id, party_kind, display_name FROM public.people_directory_seats
 WHERE seat_id IN ('aa000000-0000-4000-8000-000000000001',
                   'aa000000-0000-4000-8000-000000000002') ORDER BY party_kind;

\echo '=== A2: the whole-fixture invariant AFTER the act ==='
SELECT count(*) FILTER (WHERE pd.seat_count > 0 AND pd.seat_count <> (
          SELECT count(*) FROM public.people_directory_seats s
           WHERE s.person_id = pd.person_id)) AS rows_where_count_disagrees,
       count(*) AS total_rows
  FROM public.people_directory pd;

\echo '=== B: the party branch, an identity keyed on a LOGIN with two numbers ==='
SELECT pg_temp.reset_role();
INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, profile_id, phone, stage, created_by, updated_at)
VALUES
  ('aa000000-0000-4000-8000-000000000011','d0e00000-0000-0000-0000-00000000000a','sub',
   'Two Number Login','a0000000-0000-0000-0000-000000000002','(612) 555-0771','active',
   'a0000000-0000-0000-0000-000000000004','2026-01-01T00:00:00Z'),
  ('aa000000-0000-4000-8000-000000000012','d0e00000-0000-0000-0000-00000000000b','sub',
   'Two Number Login','a0000000-0000-0000-0000-000000000002','(612) 555-0772','active',
   'a0000000-0000-0000-0000-000000000004','2026-06-01T00:00:00Z');
INSERT INTO public.studio_channel_consent
  (organization_id, channel_kind, channel_value, status, opt_out_at,
   opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125550771','opted_out', now(),
        'verbal','said stop on site', now(),'a0000000-0000-0000-0000-000000000004');

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
\echo '--- the row, its three consent faces, and the seat it points at ---'
SELECT display_name, person_id, status_raw, meta->>'sms_consent_status' AS meta_word,
       consent_status, seat_count
  FROM public.people_directory WHERE display_name = 'Two Number Login';
\echo '--- its two seat lines ---'
SELECT seat_id, phone_e164, consent_status FROM public.people_directory_seats
 WHERE display_name = 'Two Number Login' ORDER BY seat_id;
\echo '--- the NEGATIVE CONTROL: the winning seat''s own number alone ---'
SELECT COALESCE(public.channel_consent_status(
         public.project_consent_org('d0e00000-0000-0000-0000-00000000000b'),
         'sms','+16125550772'), 'not_asked') AS old_expression_word;

\echo '=== B2: no Directory row is more permissive than the record, whole fixture ==='
SELECT count(*) AS pairs,
       count(*) FILTER (WHERE pd.consent_status = 'granted'
                          AND r.status = 'opted_out') AS face_hides_a_refusal
  FROM public.people_directory pd
  JOIN public.people_directory_seats s ON s.person_id = pd.person_id
  JOIN public.studio_channel_consent r
    ON r.channel_kind = 'sms' AND r.channel_value = s.phone_e164;

SELECT pg_temp.reset_role();
ROLLBACK;
