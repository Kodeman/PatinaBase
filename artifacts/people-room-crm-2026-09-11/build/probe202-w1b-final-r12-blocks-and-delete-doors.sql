\pset pager off
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE mgr uuid; ne uuid; w text; n int;
BEGIN
  SELECT id INTO mgr FROM public.profiles WHERE email='studio_manager@patina.dev';  -- a plain ADMIN, not the owner
  SELECT id INTO ne FROM public.studio_contacts
   WHERE organization_id='b0000000-0000-0000-0000-000000000001' AND company_name ILIKE 'Northgate%';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',mgr::text,'role','authenticated')::text, true);
  RAISE NOTICE 'Northgate paper word BEFORE: %', public.compliance_state(ne);
  -- 1. the `blocks` door (m9)
  UPDATE public.studio_compliance_documents SET blocks='{}'::text[]
   WHERE holder_id=ne AND expires_on < CURRENT_DATE AND cardinality(blocks)>0;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'm9  blocks emptied on % row(s) by a plain admin -> paper word now: %', n, public.compliance_state(ne);
  RESET ROLE;
END $$;
ROLLBACK;
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE mgr uuid; ne uuid; n int;
BEGIN
  SELECT id INTO mgr FROM public.profiles WHERE email='studio_manager@patina.dev';
  SELECT id INTO ne FROM public.studio_contacts
   WHERE organization_id='b0000000-0000-0000-0000-000000000001' AND company_name ILIKE 'Northgate%';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',mgr::text,'role','authenticated')::text, true);
  RAISE NOTICE 'Northgate paper word BEFORE: %', public.compliance_state(ne);
  DELETE FROM public.studio_compliance_documents
   WHERE holder_id=ne AND expires_on < CURRENT_DATE AND cardinality(blocks)>0;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'm9b the lapsed gating certificate DELETED outright (% row(s)) -> paper word now: %', n, public.compliance_state(ne);
  RESET ROLE;
END $$;
ROLLBACK;
