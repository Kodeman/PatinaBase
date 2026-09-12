\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'SET LOCAL role authenticated';
 EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub',p::text,'role','authenticated')::text); END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assume(uuid) TO authenticated;
DO $$ DECLARE r record; BEGIN
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000003');  -- LDS admin
  FOR r IN SELECT role, count(*) n FROM public.people_directory GROUP BY role ORDER BY role LOOP
    RAISE NOTICE 'role % : %', r.role, r.n; END LOOP;
  FOR r IN SELECT meta->>'entity_kind' k, count(*) n FROM public.people_directory
            WHERE role='contact' GROUP BY 1 ORDER BY 1 LOOP
    RAISE NOTICE '  contact/% : %', r.k, r.n; END LOOP;
END $$;

DO $$ DECLARE v uuid; BEGIN
  -- an authenticated caller who is a member of NOTHING
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000002');  -- admin@patina.dev, no memberships
  RAISE NOTICE '--- a caller who belongs to no organization at all ---';
  RAISE NOTICE '  people_directory rows: %', (SELECT count(*) FROM public.people_directory);
  RAISE NOTICE '  project_recorded_studio(Okonkwo) = %',
    public.project_recorded_studio('d0e00000-0000-0000-0000-00000000000a');
  RAISE NOTICE '  project_designer(Okonkwo)        = %',
    public.project_designer('d0e00000-0000-0000-0000-00000000000a');
  RAISE NOTICE '  project_tenant_org(Okonkwo)      = %',
    public.project_tenant_org('d0e00000-0000-0000-0000-00000000000a');
  RAISE NOTICE '  compliance_state(Northgate card) = %',
    public.compliance_state((SELECT id FROM public.studio_contacts
      WHERE company_name='Northgate Electric' LIMIT 1));
  RAISE NOTICE '  identity_phone_numbers(LDS, Dana''s card, NULL) rows: %',
    (SELECT count(*) FROM public.identity_phone_numbers(
       'b0000000-0000-0000-0000-000000000001',
       (SELECT id::text FROM public.studio_contacts WHERE full_name='Dana Kowalski' LIMIT 1), NULL));
END $$;
ROLLBACK;
