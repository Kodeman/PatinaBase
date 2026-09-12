\pset pager off
-- probe187 — r11 MAJOR-1, the fix and its negative control.
--
-- POSITIVE: probe171's fixture verbatim — one designer belonging to NO
-- organization, one project of theirs recording no studio, one unstamped gc
-- seat on it. Before the fix: project_parties 1 / people_directory 0 /
-- people_directory_seats 0 / v_project_roster 1. After: the reader agrees
-- with the record.
--
-- NEGATIVE CONTROL: the fix may admit ONLY the job's own designer of record,
-- lead designer and creator. A plain member of the designer of record's
-- SECOND design studio must still read none of the first studio's seats —
-- that is r5 MAJOR-1/MAJOR-3, and the widened leg must not reopen it.
BEGIN;
SET LOCAL client_min_messages = notice;

INSERT INTO auth.users (id, email, encrypted_password, invited_at, created_at, updated_at,
                        instance_id, aud, role)
VALUES ('bd000000-0000-4000-8000-0000000000f5','r11-solo@test.invalid','',NOW(),NOW(),NOW(),
        '00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES ('bd000000-0000-4000-8000-0000000000f5','r11-solo@test.invalid','R11 Solo',NOW(),NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.projects (id, name, designer_id, created_by, studio_id)
VALUES ('bd000000-0000-4000-8000-0000000000f6','R11 Solo Project',
        'bd000000-0000-4000-8000-0000000000f5','bd000000-0000-4000-8000-0000000000f5',NULL);
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, show_to_client)
VALUES ('bd000000-0000-4000-8000-0000000000f7','bd000000-0000-4000-8000-0000000000f6',
        'gc','R11 Solo GC',false);

-- Z belongs ONLY to Leah Hartwell, the seeded designer of record's SECOND
-- design studio, and never to Local Dev Studio.
INSERT INTO public.organization_members (organization_id, user_id, role, status, joined_at)
SELECT o.id, p.id, 'member','active', now()
  FROM public.profiles p, public.organizations o
 WHERE p.email='client@patina.dev' AND o.name='Leah Hartwell';

DO $$
DECLARE v_orgs int; v_row int; v_seats int; v_roster int; v_tenant uuid; v_raw int;
        v_cnt int; z uuid; n_seats int; n_dir int; n_raw int;
BEGIN
  -- ── POSITIVE: the solo designer, on their own job ────────────────────────
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','bd000000-0000-4000-8000-0000000000f5','role','authenticated')::text, true);

  SELECT count(*) INTO v_orgs FROM public.organization_members
   WHERE user_id = 'bd000000-0000-4000-8000-0000000000f5';
  SELECT public.project_tenant_org('bd000000-0000-4000-8000-0000000000f6') INTO v_tenant;
  RAISE NOTICE 'organizations this designer belongs to: %   project_tenant_org(their own project) = %  (is_active_studio_member -> %)',
    v_orgs, COALESCE(v_tenant::text,'NULL'), public.is_active_studio_member(v_tenant);

  SELECT count(*) INTO v_raw FROM public.project_parties
   WHERE id = 'bd000000-0000-4000-8000-0000000000f7';
  SELECT count(*) INTO v_row FROM public.people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000f7';
  SELECT count(*) INTO v_seats FROM public.people_directory_seats
   WHERE seat_id = 'bd000000-0000-4000-8000-0000000000f7';
  SELECT count(*) INTO v_roster FROM public.v_project_roster
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000f6';
  SELECT COALESCE(max(seat_count),-1) INTO v_cnt FROM public.people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000f7';
  RAISE NOTICE 'project_parties (RLS): %   people_directory: %   people_directory_seats: %   v_project_roster: %   seat_count on the row: %',
    v_raw, v_row, v_seats, v_roster, v_cnt;
  IF v_raw <> 1 OR v_row <> 1 OR v_seats <> 1 OR v_roster <> 1 OR v_cnt <> 1 THEN
    RAISE EXCEPTION 'r11 MAJOR-1 NOT FIXED: record % / directory % / seats % / roster % / claimed %',
      v_raw, v_row, v_seats, v_roster, v_cnt;
  END IF;
  RAISE NOTICE 'POSITIVE: the reader agrees with the record, and the row claims exactly what it nests.';
  RESET ROLE;

  -- ── NEGATIVE CONTROL: the designer's SECOND studio is still shut out ─────
  SELECT id INTO z FROM public.profiles WHERE email='client@patina.dev';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',z::text,'role','authenticated')::text, true);
  SELECT count(*) INTO n_raw   FROM public.project_parties pp
    JOIN public.projects pj ON pj.id = pp.project_id
   WHERE pj.studio_id = 'b0000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO n_seats FROM public.people_directory_seats s
    JOIN public.projects pj ON pj.id = s.project_id
   WHERE pj.studio_id = 'b0000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO n_dir   FROM public.people_directory WHERE role <> 'client' AND role <> 'lead' AND role <> 'maker'
     AND project_id IN (SELECT id FROM public.projects WHERE studio_id = 'b0000000-0000-0000-0000-000000000001');
  RAISE NOTICE 'the second studio''s plain member: raw project_parties (the shipped RLS door) % · people_directory_seats % · Directory party rows on those jobs %',
    n_raw, n_seats, n_dir;
  IF n_seats <> 0 OR n_dir <> 0 THEN
    RAISE EXCEPTION 'r5 MAJOR-1/MAJOR-3 REOPENED: the second studio reads % seat row(s) and % Directory row(s)', n_seats, n_dir;
  END IF;
  RAISE NOTICE 'NEGATIVE CONTROL: 0 and 0 — the widened leg admits the job''s own designer and nobody else.';
  RESET ROLE;
END $$;
ROLLBACK;
