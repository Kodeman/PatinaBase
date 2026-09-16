-- r10 probe B: does a Directory row claim a seat_count it cannot nest, with no
-- cross-tenant stamp and no adversarial write? Two design studios sharing one
-- designer of record — the shipped local shape — and one uncarded human seated
-- on a job of each.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'SET LOCAL role authenticated';
  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub',p::text,'role','authenticated')::text);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.unassume() RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'RESET role'; EXECUTE 'SET LOCAL request.jwt.claims = ''{}'''; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.unassume() TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.assume(uuid) TO authenticated;

DO $$
DECLARE
  v_lds   uuid := 'b0000000-0000-0000-0000-000000000001';  -- Local Dev Studio
  v_leah  uuid := '63a810d2-29f8-43d7-ad5f-84ac88974491';  -- Leah Hartwell
  v_ok    uuid := 'd0e00000-0000-0000-0000-00000000000a';  -- Okonkwo (records LDS)
  v_aspen uuid := 'b0000000-0000-0000-0000-0000000000d1';  -- Aspen (studio-less)
  v_phone text := '+16125557777';
  v_admin uuid := 'a0000000-0000-0000-0000-000000000003';  -- admin of LDS only
  c int; n int; k text;
BEGIN
  RAISE NOTICE 'LDS admin is member of Leah Hartwell? %',
    EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id=v_admin
             AND m.organization_id=v_leah AND m.status='active');

  -- an ordinary studio act: Leah Hartwell takes over a job the same designer runs
  UPDATE public.projects SET studio_id = v_leah WHERE id = v_aspen;

  -- one uncarded human, two seats: one on each studio's job, same number
  INSERT INTO public.project_parties (project_id, party_kind, display_name, phone, trade)
  VALUES (v_ok,    'sub', 'Wendell Pike', v_phone, 'masonry');
  INSERT INTO public.project_parties (project_id, party_kind, display_name, phone, trade)
  VALUES (v_aspen, 'sub', 'Wendell Pike', v_phone, 'masonry');

  PERFORM pg_temp.assume(v_admin);
  SELECT count(*) INTO c FROM public.people_directory
   WHERE role='sub' AND display_name='Wendell Pike';
  RAISE NOTICE 'Directory rows for Wendell Pike (as the LDS admin): %', c;

  SELECT seat_count, meta->>'identity_key' INTO n, k FROM public.people_directory
   WHERE display_name='Wendell Pike' AND role='sub';
  RAISE NOTICE '  the row CLAIMS seat_count = %  (identity_key = %)', n, k;

  SELECT count(*) INTO c FROM public.people_directory_seats s
   JOIN public.people_directory d ON d.person_id = s.person_id
  WHERE d.display_name='Wendell Pike';
  RAISE NOTICE '  it NESTS = %  <-- 00626:1463-1465 promises these are equal', c;

  SELECT count(*) INTO c FROM public.project_parties WHERE phone_e164 = v_phone;
  RAISE NOTICE '  seats the caller reads on project_parties directly: %', c;
  SELECT count(*) INTO c FROM public.people_directory_seats WHERE phone_e164 = v_phone;
  RAISE NOTICE '  seats the SEATS VIEW shows the caller: %', c;

  -- the control: the working studio's own owner, a member of BOTH studios
  PERFORM pg_temp.unassume();
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000004');
  SELECT seat_count INTO n FROM public.people_directory WHERE display_name='Wendell Pike' AND role='sub';
  SELECT count(*) INTO c FROM public.people_directory_seats s
    JOIN public.people_directory d ON d.person_id=s.person_id WHERE d.display_name='Wendell Pike';
  RAISE NOTICE 'CONTROL — the designer, member of both studios: claims % nests %', n, c;
END $$;
ROLLBACK;
