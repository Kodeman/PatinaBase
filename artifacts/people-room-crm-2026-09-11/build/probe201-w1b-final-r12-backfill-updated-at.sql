\pset pager off
-- probe201 (r12) — 00624's stage backfill bumps project_parties.updated_at on
-- every seat of every completed project (set_updated_at_project_parties is
-- BEFORE UPDATE FOR EACH ROW). Two readers turn on updated_at:
--   · people_directory's party branch DISTINCT ON winner and its project_id
--   · last_touch_at, which desk-derivation.ts / nurture read as dormancy
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE d uuid; a uuid; b uuid; r record;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';

  -- one uncarded human, keyed on a phone, seated on a COMPLETED job and on an
  -- ACTIVE one. The active seat is the more recent — today's winner.
  INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164, updated_at)
  VALUES ('d0e00000-0000-0000-0000-00000000000b','sub','Backfill Probe','+16125559977', now() - interval '400 days')
  RETURNING id INTO a;
  INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164, updated_at)
  VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Backfill Probe','+16125559977', now() - interval '10 days')
  RETURNING id INTO b;
  RAISE NOTICE 'seat on the COMPLETED job = %   seat on the ACTIVE job = %', a, b;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
  FOR r IN SELECT person_id, project_id, last_touch_at FROM public.people_directory
            WHERE display_name='Backfill Probe' LOOP
    RAISE NOTICE 'BEFORE the backfill: Directory row person_id=% project=% last_touch_at=%',
      r.person_id, (SELECT name FROM public.projects WHERE id=r.project_id), r.last_touch_at;
  END LOOP;
  RESET ROLE;

  -- 00624:756-765 verbatim
  UPDATE public.project_parties pp
     SET stage = CASE
                   WHEN COALESCE(pj.completed_at, pj.updated_at) > now() - interval '12 months'
                     THEN 'warranty' ELSE 'off_job' END
    FROM public.projects pj
   WHERE pj.id = pp.project_id AND pj.status = 'completed' AND pp.stage = 'active';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
  FOR r IN SELECT person_id, project_id, last_touch_at FROM public.people_directory
            WHERE display_name='Backfill Probe' LOOP
    RAISE NOTICE 'AFTER  the backfill: Directory row person_id=% project=% last_touch_at=%',
      r.person_id, (SELECT name FROM public.projects WHERE id=r.project_id), r.last_touch_at;
  END LOOP;
  RESET ROLE;

  -- and how many seats the backfill touches, repo-wide, at this ledger
  SELECT count(*) INTO a FROM public.project_parties pp
    JOIN public.projects pj ON pj.id=pp.project_id
   WHERE pj.status='completed';
  RAISE NOTICE 'seats on completed projects locally: %', a;
END $$;
ROLLBACK;
