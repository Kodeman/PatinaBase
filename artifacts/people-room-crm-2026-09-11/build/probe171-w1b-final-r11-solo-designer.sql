\pset pager off
-- probe171: the solo designer (no organization at all) loses every party row
-- from people_directory v4. Replicates tests/rls/people_directory_scope_test.sql's
-- case (h) fixture, measures, then restores the pre-v4 predicate as the control.
BEGIN;
SET LOCAL client_min_messages = notice;

-- fixture: one designer belonging to NO organization, one project of theirs
-- recording no studio, one unstamped gc seat on it.
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

DO $$
DECLARE v_orgs int; v_row int; v_seats int; v_roster int; v_tenant uuid; v_raw int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','bd000000-0000-4000-8000-0000000000f5','role','authenticated')::text, true);

  SELECT count(*) INTO v_orgs FROM public.organization_members
   WHERE user_id = 'bd000000-0000-4000-8000-0000000000f5';
  RAISE NOTICE 'organizations this designer belongs to: %', v_orgs;

  SELECT public.project_tenant_org('bd000000-0000-4000-8000-0000000000f6') INTO v_tenant;
  RAISE NOTICE 'project_tenant_org(their own project) = %  (is_active_studio_member -> %)',
    COALESCE(v_tenant::text,'NULL'),
    public.is_active_studio_member(v_tenant);

  SELECT count(*) INTO v_raw FROM public.project_parties
   WHERE id = 'bd000000-0000-4000-8000-0000000000f7';
  RAISE NOTICE 'the seat read straight off project_parties (RLS): %  <-- the record', v_raw;

  SELECT count(*) INTO v_row FROM public.people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000f7';
  RAISE NOTICE 'people_directory rows for that seat: %  <-- the reader', v_row;

  SELECT count(*) INTO v_seats FROM public.people_directory_seats
   WHERE seat_id = 'bd000000-0000-4000-8000-0000000000f7';
  RAISE NOTICE 'people_directory_seats rows for that seat: %', v_seats;

  SELECT count(*) INTO v_roster FROM public.v_project_roster
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000f6';
  RAISE NOTICE 'v_project_roster rows on their own job: %  (the shipped roster view)', v_roster;

  RESET ROLE;
END $$;
ROLLBACK;
