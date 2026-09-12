\pset pager off
BEGIN;
SET LOCAL client_min_messages=notice;
INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, created_by)
SELECT 'b0000000-0000-0000-0000-000000000001','person','sub','Scale Person '||g,
       'a0000000-0000-0000-0000-000000000004' FROM generate_series(1,400) g;
INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164)
SELECT 'd0e00000-0000-0000-0000-00000000000a','sub','Scale Seat '||g,
       '+1612' || lpad((7000000+g)::text, 7, '0') FROM generate_series(1,600) g;
ANALYZE public.project_parties; ANALYZE public.studio_contacts;
DO $$
DECLARE t0 timestamptz; t1 timestamptz; n int; d uuid;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);

  t0:=clock_timestamp();
  SELECT count(*) INTO n FROM public.studio_contacts sc
   WHERE public.is_active_studio_member(sc.organization_id);
  t1:=clock_timestamp(); RAISE NOTICE 'contacts branch skeleton: % rows in %', n, t1-t0;

  t0:=clock_timestamp();
  SELECT count(public.identity_seat_count(sc.id::text)) INTO n FROM public.studio_contacts sc
   WHERE public.is_active_studio_member(sc.organization_id);
  t1:=clock_timestamp(); RAISE NOTICE '  + identity_seat_count only: % rows in %', n, t1-t0;

  t0:=clock_timestamp();
  SELECT count(public.identity_consent_status(sc.organization_id, sc.id::text, sc.phone_e164)) INTO n
    FROM public.studio_contacts sc WHERE public.is_active_studio_member(sc.organization_id);
  t1:=clock_timestamp(); RAISE NOTICE '  + identity_consent_status only: % rows in %', n, t1-t0;

  t0:=clock_timestamp();
  SELECT count(public.identity_paper_state(sc.id, sc.company_id)) INTO n
    FROM public.studio_contacts sc WHERE public.is_active_studio_member(sc.organization_id);
  t1:=clock_timestamp(); RAISE NOTICE '  + identity_paper_state only: % rows in %', n, t1-t0;
  RESET ROLE;
END $$;
ROLLBACK;
