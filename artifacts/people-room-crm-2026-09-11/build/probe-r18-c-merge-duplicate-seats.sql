\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- two cards for ONE human, in the seeded studio
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164, created_by)
VALUES ('f8a00000-0000-4000-8000-00000000000a','b0000000-0000-0000-0000-000000000001','person','trade','Probe Twin A','612-555-9001','+16125559001','a0000000-0000-0000-0000-000000000004'),
       ('f8a00000-0000-4000-8000-00000000000b','b0000000-0000-0000-0000-000000000001','person','trade','Probe Twin B','612-555-9002','+16125559002','a0000000-0000-0000-0000-000000000004');

-- BOTH seated on the SAME job, same kind
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, studio_contact_id, created_by)
VALUES ('f8b00000-0000-4000-8000-00000000000a','d0e00000-0000-0000-0000-00000000000a','sub','Probe Twin A','612-555-9001','f8a00000-0000-4000-8000-00000000000a','a0000000-0000-0000-0000-000000000004'),
       ('f8b00000-0000-4000-8000-00000000000b','d0e00000-0000-0000-0000-00000000000a','sub','Probe Twin B','612-555-9002','f8a00000-0000-4000-8000-00000000000b','a0000000-0000-0000-0000-000000000004');

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
\echo '--- C-a: before the merge, two Directory rows, one seat each ---'
SELECT person_id, display_name, seat_count FROM public.people_directory
 WHERE display_name LIKE 'Probe Twin%' ORDER BY display_name;

SELECT public.merge_studio_contacts('f8a00000-0000-4000-8000-00000000000a','f8a00000-0000-4000-8000-00000000000b','phone') AS survivor;

\echo '--- C-b: after the merge, ONE Directory row; how many seats does it claim? ---'
SELECT person_id, display_name, seat_count FROM public.people_directory
 WHERE display_name LIKE 'Probe Twin%' ORDER BY display_name;
\echo '--- C-c: what people_directory_seats nests for that identity ---'
SELECT person_id, project_name, party_kind, display_name FROM public.people_directory_seats
 WHERE person_id = 'f8a00000-0000-4000-8000-00000000000a' ORDER BY project_name, display_name;
\echo '--- C-d: the raw seats on that job for the survivor ---'
SELECT id, party_kind, display_name, off_job_at FROM public.project_parties
 WHERE studio_contact_id='f8a00000-0000-4000-8000-00000000000a' ORDER BY id;
SELECT pg_temp.reset_role();

\echo '--- C-e: orphan sweep — anything still naming the folded card, other than the lineage/pointer ---'
DO $$
DECLARE r record; n bigint; out_txt text := '';
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text tbl, a.attname col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum = ANY(c.conkey)
     WHERE c.contype='f' AND c.confrelid='public.studio_contacts'::regclass
     ORDER BY 1,2
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = %L', r.tbl, r.col, 'f8a00000-0000-4000-8000-00000000000b') INTO n;
    IF n > 0 THEN out_txt := out_txt || r.tbl || '.' || r.col || '=' || n || '  '; END IF;
  END LOOP;
  RAISE NOTICE 'residual pointers at the folded card: %', COALESCE(NULLIF(out_txt,''),'(none)');
  SELECT count(*) INTO n FROM public.client_households WHERE 'f8a00000-0000-4000-8000-00000000000b'::uuid = ANY(member_person_ids);
  RAISE NOTICE 'household arrays naming the folded card: %', n;
END $$;
ROLLBACK;
