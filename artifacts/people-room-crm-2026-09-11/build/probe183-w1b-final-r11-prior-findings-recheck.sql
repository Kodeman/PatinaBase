\pset pager off
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE d uuid; n int; v text;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);

  -- r10 M2 re-check: no row claims a count it cannot nest
  SELECT count(*) INTO n FROM (
    SELECT pd.person_id, pd.seat_count,
           (SELECT count(*) FROM public.people_directory_seats s WHERE s.person_id = pd.person_id) AS nests
      FROM public.people_directory pd
     WHERE pd.seat_count > 0) x WHERE x.seat_count <> x.nests;
  RAISE NOTICE 'r10 M2 — Directory rows claiming a seat_count they cannot nest: %', n;

  -- r10 F2 re-check: Pete Rusk's reach
  SELECT pd.reach_state || ' / ' || COALESCE(pd.consent_status,'(null)') INTO v
    FROM public.people_directory pd WHERE pd.display_name='Pete Rusk';
  RAISE NOTICE 'r10 F2 — Pete Rusk reach/consent: %', v;

  -- r10 m6 re-check: firm rows carrying a consent word
  SELECT count(*) INTO n FROM public.people_directory
   WHERE role='contact' AND meta->>'entity_kind'='company' AND consent_status IS NOT NULL;
  RAISE NOTICE 'r10 m6 — company rows carrying consent_status: % (of % company rows)', n,
    (SELECT count(*) FROM public.people_directory WHERE role='contact' AND meta->>'entity_kind'='company');

  -- r10 m4 re-check: evidence_upload tier for a studio member
  SELECT count(*) INTO n FROM public.v_access_grants WHERE tier='evidence_upload';
  RAISE NOTICE 'r10 m4 — evidence_upload rows for the studio owner: % (tokens on the table: %)', n,
    (SELECT count(*) FROM public.fulfillment_evidence_upload_tokens);
  RESET ROLE;

  -- r10 m1 re-check, as superuser: the project_review tier's granted_by
  SELECT pg_get_viewdef('public.v_access_grants'::regclass, true) INTO v;
  RAISE NOTICE 'r10 m1 — project_review branch still projects revoked_by as granted_by: %',
    (v LIKE '%pra.revoked_by%');
  -- r10 m7
  RAISE NOTICE 'r10 m7 — anon SELECT on people_directory: %',
    has_table_privilege('anon','public.people_directory','SELECT');
END $$;
ROLLBACK;
