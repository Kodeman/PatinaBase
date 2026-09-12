\pset pager off
BEGIN;
SET LOCAL client_min_messages=notice;
-- Z belongs ONLY to Leah Hartwell, the designer of record's SECOND design
-- studio. Local Dev Studio is the studio doing the work on every one of these
-- jobs; Z is not a member of it.
INSERT INTO public.organization_members (organization_id, user_id, role, status, joined_at)
SELECT o.id, p.id, 'member','active', now()
  FROM public.profiles p, public.organizations o
 WHERE p.email='client@patina.dev' AND o.name='Leah Hartwell';

DO $$
DECLARE z uuid; lds_admin uuid; leah uuid; v_card uuid; v_seat uuid; n int; v_pid uuid;
        v_person uuid; v_ok bool;
BEGIN
  SELECT id INTO z FROM public.profiles WHERE email='client@patina.dev';
  SELECT id INTO lds_admin FROM public.profiles WHERE email='studio_manager@patina.dev';
  SELECT id INTO leah FROM public.organizations WHERE name='Leah Hartwell';

  -- ── as Z, a member of the OTHER studio ────────────────────────────────
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',z::text,'role','authenticated')::text, true);
  RAISE NOTICE 'Z member of Local Dev Studio? %   of Leah Hartwell? %',
    public.is_active_studio_member('b0000000-0000-0000-0000-000000000001'),
    public.is_active_studio_member(leah);
  RAISE NOTICE 'project_tenant_org(Aspen Loft, as Z) = %',
    public.project_tenant_org('b0000000-0000-0000-0000-0000000000d1');

  INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, created_by)
  VALUES (leah,'person','sub','Foreign Card Wendell', z)
  RETURNING id INTO v_card;
  RAISE NOTICE 'Z filed a card in Leah Hartwell: %', v_card;

  INSERT INTO public.project_parties (project_id, party_kind, display_name, studio_contact_id)
  VALUES ('b0000000-0000-0000-0000-0000000000d1','sub','Foreign Card Wendell', v_card)
  RETURNING id INTO v_seat;
  RAISE NOTICE 'the stamped seat LANDED on Local Dev Studio''s job: %  <-- assert_project_party_cards accepted it', v_seat;
  RESET ROLE;

  -- ── as the admin of the studio doing the work ─────────────────────────
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',lds_admin::text,'role','authenticated')::text, true);
  RAISE NOTICE '--- as Local Dev Studio''s admin ---';
  RAISE NOTICE '  project_tenant_org(Aspen Loft, as the LDS admin) = %',
    public.project_tenant_org('b0000000-0000-0000-0000-0000000000d1');
  SELECT count(*) INTO n FROM public.studio_contacts WHERE id = v_card;
  RAISE NOTICE '  can the LDS admin read that rolodex card? % row(s)', n;
  SELECT count(*) INTO n FROM public.project_parties WHERE id = v_seat;
  RAISE NOTICE '  can the LDS admin read the seat itself? % row(s)', n;
  SELECT person_id INTO v_person FROM public.people_directory_seats WHERE seat_id = v_seat;
  RAISE NOTICE '  the seat nests under person_id = %  (the foreign card)', COALESCE(v_person::text,'(absent)');
  SELECT count(*) INTO n FROM public.people_directory WHERE person_id = v_person;
  RAISE NOTICE '  Directory rows the LDS admin can open for that person_id: %  <-- the human is unreachable', n;
  SELECT count(*) INTO n FROM public.v_project_roster WHERE party_id = v_seat;
  RAISE NOTICE '  v_project_roster still names the seat: % row(s)', n;
  RESET ROLE;
END $$;
ROLLBACK;
