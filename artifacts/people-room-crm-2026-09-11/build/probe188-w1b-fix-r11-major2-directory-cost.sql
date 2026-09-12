\pset pager off
-- probe188 — r11 MAJOR-2, the fix and its gate.
--
-- probe180's growth curve verbatim (the same fixture, the same query, the same
-- 8s statement_timeout `authenticated` carries in its own rolconfig), plus
-- probe181's 600/600 timeout gate and a check that the seat counts the view
-- prints still equal the seats it nests (R-BG) at scale.
--
-- Before: 62 rows 0.10 s · 262 rows 1.32 s · 662 rows 7.15 s · 1462 rows 32.5 s
--         · 3062 rows 140 s; and at 649 cards / 631 seats the query was
--         cancelled by the timeout.
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE t0 timestamptz; t1 timestamptz; n int; d uuid; k int; msg text;
        bad int; claims int; nests int;
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
      RAISE EXCEPTION 'r11 MAJOR-2 NOT FIXED: the room''s own feed is still cancelled at % extra cards/seats', k;
    END;
    SET LOCAL statement_timeout = 0;
    RESET ROLE;
  END LOOP;

  -- the gate, at the size the finding names: >= 600 cards and >= 600 seats
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
  SELECT count(*) INTO claims FROM public.studio_contacts
   WHERE organization_id='b0000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO nests FROM public.people_directory_seats;
  RAISE NOTICE 'the fixture the gate runs on: % rolodex cards · % seat rows', claims, nests;

  SET LOCAL statement_timeout = '8s';
  t0:=clock_timestamp();
  SELECT count(*) INTO n FROM (SELECT * FROM public.people_directory) s;
  t1:=clock_timestamp();
  RAISE NOTICE 'GATE: SELECT * FROM people_directory under statement_timeout=8s returned % rows in %', n, t1-t0;
  SET LOCAL statement_timeout = 0;

  -- and R-BG still holds at scale: no row claims a seat_count it cannot nest
  SELECT count(*) INTO bad
    FROM public.people_directory d
    LEFT JOIN ( SELECT person_id, count(*)::int c FROM public.people_directory_seats
                 GROUP BY person_id ) s ON s.person_id = d.person_id
   WHERE d.seat_count <> COALESCE(s.c, 0);
  RAISE NOTICE 'Directory rows claiming a seat_count they cannot nest: %', bad;
  IF bad <> 0 THEN
    RAISE EXCEPTION 'R-BG broken by the CTE: % row(s) claim what they do not nest', bad;
  END IF;

  -- and the grouped CTE agrees with identity_seat_count() row for row, on the
  -- carded identities the contacts branch emits (one predicate, three homes)
  SELECT count(*) INTO bad FROM public.people_directory d
   WHERE d.role = 'contact'
     AND d.seat_count <> public.identity_seat_count(d.person_id::text);
  RAISE NOTICE 'contacts rows where the CTE and identity_seat_count() disagree: %', bad;
  IF bad <> 0 THEN
    RAISE EXCEPTION 'the CTE and identity_seat_count() have drifted apart on % row(s)', bad;
  END IF;
  RESET ROLE;
END $$;
ROLLBACK;
