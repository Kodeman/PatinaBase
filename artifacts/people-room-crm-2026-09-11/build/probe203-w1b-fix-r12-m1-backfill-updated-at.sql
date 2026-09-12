\pset pager off
-- probe203 (r12 FIX, M1) — the walk probe201 made, run twice: once with
-- 00624:756-765 as the reviewer found it (the negative control, which must
-- still flip the Directory row onto the CLOSED job), once with the shipped
-- bracketed form (which must not move person_id, project_id or last_touch_at
-- at all, while the stage itself still moves).
BEGIN;
SET LOCAL client_min_messages=notice;

-- one uncarded human, keyed on a phone no rolodex card carries, seated on a
-- COMPLETED job (400 days quiet) and on an ACTIVE one (10 days quiet).
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone_e164, updated_at)
VALUES ('0b0b0b0b-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000b',
        'sub','Backfill Probe','+16125559977', now() - interval '400 days'),
       ('0b0b0b0b-0000-4000-8000-000000000002','d0e00000-0000-0000-0000-00000000000a',
        'sub','Backfill Probe','+16125559977', now() - interval '10 days');

DO $$
DECLARE d uuid; r record;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';
  RAISE NOTICE 'seat on the COMPLETED job = ...0001 (Lindqvist)   seat on the ACTIVE job = ...0002 (Okonkwo)';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
  FOR r IN SELECT person_id, project_id, last_touch_at FROM public.people_directory
            WHERE display_name='Backfill Probe' LOOP
    RAISE NOTICE 'BEFORE any backfill: person_id=% project=% last_touch_at=%',
      r.person_id, (SELECT name FROM public.projects WHERE id=r.project_id), r.last_touch_at;
  END LOOP;
  RESET ROLE;
END $$;

-- ── NEGATIVE CONTROL: the statement as r12 found it, no brackets ──────────
SAVEPOINT before_control;

UPDATE public.project_parties pp
   SET stage = CASE
                 WHEN COALESCE(pj.completed_at, pj.updated_at) > now() - interval '12 months'
                   THEN 'warranty' ELSE 'off_job' END
  FROM public.projects pj
 WHERE pj.id = pp.project_id AND pj.status = 'completed' AND pp.stage = 'active';

DO $$
DECLARE d uuid; r record;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
  FOR r IN SELECT person_id, project_id, last_touch_at FROM public.people_directory
            WHERE display_name='Backfill Probe' LOOP
    RAISE NOTICE 'CONTROL (unbracketed, what r12 walked): person_id=% project=% last_touch_at=%',
      r.person_id, (SELECT name FROM public.projects WHERE id=r.project_id), r.last_touch_at;
  END LOOP;
  RESET ROLE;
END $$;

ROLLBACK TO SAVEPOINT before_control;

-- ── THE SHIPPED FORM: 00624 as it now reads ──────────────────────────────
ALTER TABLE public.project_parties DISABLE TRIGGER set_updated_at_project_parties;

UPDATE public.project_parties pp
   SET stage = CASE
                 WHEN COALESCE(pj.completed_at, pj.updated_at) > now() - interval '12 months'
                   THEN 'warranty' ELSE 'off_job' END
  FROM public.projects pj
 WHERE pj.id = pp.project_id AND pj.status = 'completed' AND pp.stage = 'active';

ALTER TABLE public.project_parties ENABLE TRIGGER set_updated_at_project_parties;

DO $$
DECLARE d uuid; r record;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';
  RAISE NOTICE 'shipped backfill: the completed-job seat stage is now % (the stage DID move)',
    (SELECT stage FROM public.project_parties WHERE id='0b0b0b0b-0000-4000-8000-000000000001');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
  FOR r IN SELECT person_id, project_id, last_touch_at FROM public.people_directory
            WHERE display_name='Backfill Probe' LOOP
    RAISE NOTICE 'AFTER the shipped backfill: person_id=% project=% last_touch_at=%',
      r.person_id, (SELECT name FROM public.projects WHERE id=r.project_id), r.last_touch_at;
  END LOOP;
  RESET ROLE;
END $$;
ROLLBACK;
