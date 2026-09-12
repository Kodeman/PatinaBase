\pset pager off
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE v_z uuid := gen_random_uuid(); v_leah uuid := '5996ea1d-7e47-4582-a18a-7e5bda9ace5f'; r record;
BEGIN
  INSERT INTO auth.users (id, email, aud, role, instance_id, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (v_z,'z2-r12@probe.test','authenticated','authenticated','00000000-0000-0000-0000-000000000000','x',now(),now(),now());
  INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES (v_leah, v_z, 'member','active');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_z::text,'role','authenticated')::text, true);
  FOR r IN SELECT role, count(*) c, min(display_name) s FROM public.people_directory GROUP BY role LOOP
    RAISE NOTICE 'Z people_directory role=% count=% eg=%', r.role, r.c, r.s;
  END LOOP;
  FOR r IN SELECT tier, count(*) c FROM public.v_access_grants GROUP BY tier LOOP
    RAISE NOTICE 'Z v_access_grants tier=% count=%', r.tier, r.c;
  END LOOP;
  RESET ROLE;
END $$;
ROLLBACK;
