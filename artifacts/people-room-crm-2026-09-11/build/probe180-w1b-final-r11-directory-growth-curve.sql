\pset pager off
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE t0 timestamptz; t1 timestamptz; n int; d uuid; k int; msg text;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';
  FOREACH k IN ARRAY ARRAY[0,100,200,400,800] LOOP
    IF k > 0 THEN
      INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, created_by)
      SELECT 'b0000000-0000-0000-0000-000000000001','person','sub','Scale P '||k||'-'||g,
             'a0000000-0000-0000-0000-000000000004' FROM generate_series(1,k) g;
      INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164)
      SELECT 'd0e00000-0000-0000-0000-00000000000a','sub','Scale S '||k||'-'||g,
             '+1612'||lpad((7000000+k*1000+g)::text,7,'0') FROM generate_series(1,k) g;
      ANALYZE public.project_parties; ANALYZE public.studio_contacts;
    END IF;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
    SET LOCAL statement_timeout = '8s';       -- authenticated's own rolconfig
    BEGIN
      t0:=clock_timestamp();
      SELECT count(*) INTO n FROM (SELECT * FROM public.people_directory) s WHERE s.seat_count IS NOT NULL;
      t1:=clock_timestamp();
      RAISE NOTICE 'cards+seats added=% -> people_directory SELECT * : % rows in %', k, n, t1-t0;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
      RAISE NOTICE 'cards+seats added=% -> SELECT * RAISED % (%)', k, SQLSTATE, msg;
    END;
    SET LOCAL statement_timeout = 0;
    RESET ROLE;
  END LOOP;
END $$;
ROLLBACK;
