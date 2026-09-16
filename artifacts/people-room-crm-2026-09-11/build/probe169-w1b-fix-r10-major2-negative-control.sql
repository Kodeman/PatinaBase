-- r10 fix probe B: identity_seat_count() carries the seats view's own gate,
-- and the NEGATIVE CONTROL — the pre-fix RLS-only body restored in the same
-- transaction, same rows, same callers. Everything ROLLBACKs.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'SET LOCAL role authenticated';
 EXECUTE format('SET LOCAL request.jwt.claims = %L',
   json_build_object('sub',p::text,'role','authenticated')::text); END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assume(uuid) TO authenticated;

-- probe162's fixture, on the SEEDED shape: Leah Hartwell is the designer of
-- record's second design studio; it takes over the studio-less Aspen job, and
-- one uncarded human takes a seat on a job of each studio with one number.
UPDATE public.projects
   SET studio_id = (SELECT id FROM public.organizations WHERE name='Leah Hartwell')
 WHERE id = 'b0000000-0000-0000-0000-0000000000d1';
INSERT INTO public.project_parties (project_id, party_kind, display_name, phone, trade)
VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Wendell Pike','+16125557777','masonry'),
       ('b0000000-0000-0000-0000-0000000000d1','sub','Wendell Pike','+16125557777','masonry');

DO $$
DECLARE c int; n int;
BEGIN
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000003');  -- admin of LDS only
  RAISE NOTICE 'LDS admin is a member of Leah Hartwell? %',
    public.is_active_studio_member((SELECT id FROM public.organizations WHERE name='Leah Hartwell'));
  SELECT count(*) INTO c FROM public.project_parties WHERE phone_e164='+16125557777';
  RAISE NOTICE 'seats the caller reads on project_parties directly: %  (not a read door)', c;
  SELECT seat_count INTO n FROM public.people_directory
   WHERE display_name='Wendell Pike' AND role='sub';
  SELECT count(*) INTO c FROM public.people_directory_seats s
    JOIN public.people_directory d ON d.person_id=s.person_id
   WHERE d.display_name='Wendell Pike';
  RAISE NOTICE 'ONE-STUDIO caller  claims=%  nests=%   <-- must be equal', n, c;

  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000004');  -- member of BOTH
  SELECT seat_count INTO n FROM public.people_directory
   WHERE display_name='Wendell Pike' AND role='sub';
  SELECT count(*) INTO c FROM public.people_directory_seats s
    JOIN public.people_directory d ON d.person_id=s.person_id
   WHERE d.display_name='Wendell Pike';
  RAISE NOTICE 'CONTROL both studios  claims=%  nests=%', n, c;
END $$;

-- ── NEGATIVE CONTROL: the pre-fix body, RLS alone ───────────────────────────
RESET role;
CREATE OR REPLACE FUNCTION public.identity_seat_count(p_identity_key text)
RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT count(*)::integer
    FROM public.project_parties pp
   WHERE p_identity_key IS NOT NULL
     AND public.party_identity_key(
           pp.studio_contact_id, pp.profile_id, pp.phone_e164, pp.email, pp.id
         ) = p_identity_key;
$$;
DO $$
DECLARE c int; n int; bad int;
BEGIN
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000003');
  SELECT seat_count INTO n FROM public.people_directory
   WHERE display_name='Wendell Pike' AND role='sub';
  SELECT count(*) INTO c FROM public.people_directory_seats s
    JOIN public.people_directory d ON d.person_id=s.person_id
   WHERE d.display_name='Wendell Pike';
  RAISE NOTICE 'SAME ROWS, pre-fix body: ONE-STUDIO caller claims=% nests=%  <-- the defect', n, c;
  SELECT count(*) INTO bad FROM public.people_directory pd
   WHERE pd.seat_count > 0
     AND pd.seat_count <> (SELECT count(*) FROM public.people_directory_seats s
                            WHERE s.person_id = pd.person_id);
  RAISE NOTICE '  Directory rows claiming a count they cannot nest: %', bad;
END $$;
ROLLBACK;
