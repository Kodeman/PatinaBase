\pset pager off
-- probe197 (r12) — does a carded human's UNSTAMPED seat on the same phone
-- collapse into their card's identity row, or become a second row?
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE d uuid; card uuid; ph text; n int; r record; before_rows int; after_rows int;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';
  SELECT sc.id, sc.phone_e164 INTO card, ph
    FROM public.studio_contacts sc
   WHERE sc.organization_id='b0000000-0000-0000-0000-000000000001'
     AND sc.full_name='Dana Kowalski';
  RAISE NOTICE 'Dana card=%  phone=%', card, ph;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
  SELECT count(*) INTO before_rows FROM public.people_directory;
  FOR r IN SELECT person_id, role, display_name, seat_count, consent_status
             FROM public.people_directory WHERE display_name='Dana Kowalski' LOOP
    RAISE NOTICE 'BEFORE  person_id=% role=% seats=% consent=%', r.person_id, r.role, r.seat_count, r.consent_status;
  END LOOP;
  RESET ROLE;

  -- the studio adds one more seat for the SAME human on the SAME number and
  -- simply does not stamp the card (the ordinary Add-to-roster path)
  INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164, trade)
  VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Dana Kowalski', ph, 'electrical');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
  SELECT count(*) INTO after_rows FROM public.people_directory;
  FOR r IN SELECT person_id, role, display_name, seat_count, consent_status
             FROM public.people_directory WHERE display_name='Dana Kowalski' LOOP
    RAISE NOTICE 'AFTER   person_id=% role=% seats=% consent=%', r.person_id, r.role, r.seat_count, r.consent_status;
  END LOOP;
  RAISE NOTICE 'people_directory rows: % -> %  (one human, one new seat)', before_rows, after_rows;
  SELECT count(*) INTO n FROM public.people_directory_seats
   WHERE display_name='Dana Kowalski';
  RAISE NOTICE 'people_directory_seats rows for Dana: %', n;
  FOR r IN SELECT identity_key, person_id, seat_id, project_name FROM public.people_directory_seats
            WHERE display_name='Dana Kowalski' LOOP
    RAISE NOTICE '   seat identity_key=% person_id=% project=%', r.identity_key, r.person_id, r.project_name;
  END LOOP;
  RESET ROLE;
END $$;
ROLLBACK;
