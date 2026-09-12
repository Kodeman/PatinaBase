\pset pager off
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE t0 timestamptz; t1 timestamptz; n int; d uuid; k int; msg text; cards int; seats int;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';
  FOREACH k IN ARRAY ARRAY[0,1600,1600] LOOP
    IF k > 0 THEN
      INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, created_by)
      SELECT 'b0000000-0000-0000-0000-000000000001','person','sub','Scale P '||g||'-'||clock_timestamp()::text,
             'a0000000-0000-0000-0000-000000000004' FROM generate_series(1,k) g;
      INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164)
      SELECT 'd0e00000-0000-0000-0000-00000000000a','sub','Scale S '||g,
             '+1612'||lpad((floor(random()*8000000)::int+1000000+g)::text,7,'0') FROM generate_series(1,k) g;
      ANALYZE public.project_parties; ANALYZE public.studio_contacts;
    END IF;
    SELECT count(*) INTO cards FROM public.studio_contacts WHERE organization_id='b0000000-0000-0000-0000-000000000001';
    SELECT count(*) INTO seats FROM public.project_parties;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
    SET LOCAL statement_timeout = '8s';
    -- the shape PostgREST issues: max_rows = 1000 (config.toml:18)
    BEGIN
      t0:=clock_timestamp();
      SELECT count(*) INTO n FROM (SELECT * FROM public.people_directory LIMIT 1000) s;
      t1:=clock_timestamp();
      RAISE NOTICE 'cards=% seats=% -> SELECT * LIMIT 1000 : % rows in %', cards, seats, n, t1-t0;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
      RAISE NOTICE 'cards=% seats=% -> LIMIT 1000 RAISED % (%)', cards, seats, SQLSTATE, msg;
    END;
    -- and usePerson's shape: filter above the view
    BEGIN
      t0:=clock_timestamp();
      PERFORM * FROM public.people_directory WHERE person_id = (SELECT id FROM public.studio_contacts WHERE organization_id='b0000000-0000-0000-0000-000000000001' LIMIT 1) LIMIT 1;
      t1:=clock_timestamp();
      RAISE NOTICE '   usePerson (person_id filter above the view) in %', t1-t0;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
      RAISE NOTICE '   usePerson RAISED % (%)', SQLSTATE, msg;
    END;
    SET LOCAL statement_timeout = 0;
    RESET ROLE;
  END LOOP;
END $$;
ROLLBACK;
