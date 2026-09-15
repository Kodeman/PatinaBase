\pset pager off
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true) IS NOT NULL;
DO $$
DECLARE h uuid;
BEGIN
  INSERT INTO public.client_households (organization_id, designer_id, display_name, member_person_ids, co_threshold_cents)
  VALUES ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004','Probe HH',
          ARRAY['d0e10000-0000-0000-0000-000000000005'::uuid], 250000) RETURNING id INTO h;
  BEGIN
    PERFORM public.add_household_member(h,'d0e10000-0000-0000-0000-000000000005','client_rep','b0000000-0000-0000-0000-0000000000d1');
    RAISE NOTICE 'client_rep on studio-less job: LANDED';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'client_rep on studio-less job -> %', SQLERRM; END;
  BEGIN
    PERFORM public.add_household_member(h,'d0e10000-0000-0000-0000-000000000005','client','b0000000-0000-0000-0000-0000000000d1');
    RAISE NOTICE 'client on studio-less job: LANDED';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'client on studio-less job -> %', SQLERRM; END;
END $$;
ROLLBACK;
