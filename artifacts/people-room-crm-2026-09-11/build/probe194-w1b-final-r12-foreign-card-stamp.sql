\pset pager off
-- probe194 (r12) — r11 M3 re-walk: can a member of the designer's SECOND
-- design studio still stamp a foreign rolodex card on the working studio's job?
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE
  v_z uuid := gen_random_uuid();
  v_leah uuid := '5996ea1d-7e47-4582-a18a-7e5bda9ace5f';
  v_lds  uuid := 'b0000000-0000-0000-0000-000000000001';
  v_designer uuid := 'a0000000-0000-0000-0000-000000000004';
  v_studioless uuid := 'b0000000-0000-0000-0000-0000000000d1';   -- Aspen Loft, studio_id NULL
  v_recorded   uuid := 'd0e00000-0000-0000-0000-00000000000a';   -- Okonkwo, records LDS
  v_card uuid; v_seat uuid; v_ok text; n int;
BEGIN
  -- Z belongs to Leah Hartwell only. The designer of record belongs to both.
  INSERT INTO auth.users (id, email, aud, role, instance_id, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (v_z,'z-r12@probe.test','authenticated','authenticated',
          '00000000-0000-0000-0000-000000000000','x',now(),now(),now());
  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (v_leah, v_z, 'member','active');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_z::text,'role','authenticated')::text, true);
  RAISE NOTICE 'Z in LDS? %  in Leah? %  project_tenant_org(Aspen Loft as Z) = %',
    public.is_active_studio_member(v_lds), public.is_active_studio_member(v_leah),
    coalesce(public.project_tenant_org(v_studioless)::text,'NULL');
  RAISE NOTICE 'project_recorded_studio(Aspen Loft) = %',
    coalesce(public.project_recorded_studio(v_studioless)::text,'NULL');

  INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, created_by)
  VALUES (v_leah,'person','sub','Foreign Card R12', v_z) RETURNING id INTO v_card;
  RAISE NOTICE 'Z filed a card in Leah Hartwell: %', v_card;

  -- 1. INSERT a seat on the studio-less job stamped with the foreign card
  BEGIN
    INSERT INTO public.project_parties (project_id, party_kind, display_name, studio_contact_id)
    VALUES (v_studioless,'sub','Foreign Stamp R12', v_card) RETURNING id INTO v_seat;
    RAISE NOTICE 'A1 FOREIGN STAMP ON A STUDIO-LESS JOB LANDED: %  <-- open', v_seat;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_ok = MESSAGE_TEXT;
    RAISE NOTICE 'A1 refused: %', v_ok;
  END;

  -- 2. the same foreign card on a job that RECORDS Local Dev Studio
  BEGIN
    INSERT INTO public.project_parties (project_id, party_kind, display_name, studio_contact_id)
    VALUES (v_recorded,'sub','Foreign Stamp R12b', v_card) RETURNING id INTO v_seat;
    RAISE NOTICE 'A2 FOREIGN STAMP ON A RECORDED JOB LANDED: %  <-- open', v_seat;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_ok = MESSAGE_TEXT;
    RAISE NOTICE 'A2 refused: %', v_ok;
  END;

  -- 3. control: re-stamp an EXISTING Okonkwo seat with the foreign card (UPDATE path)
  SELECT id INTO v_seat FROM public.project_parties
   WHERE project_id=v_recorded AND studio_contact_id IS NOT NULL LIMIT 1;
  BEGIN
    UPDATE public.project_parties SET studio_contact_id=v_card WHERE id=v_seat;
    RAISE NOTICE 'A3 RE-STAMP OF AN EXISTING SEAT LANDED  <-- open';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_ok = MESSAGE_TEXT;
    RAISE NOTICE 'A3 refused: %', v_ok;
  END;

  -- 4. control: company_id / warranty_contact_person_id on the studio-less job
  BEGIN
    INSERT INTO public.project_parties (project_id, party_kind, display_name, company_id)
    VALUES (v_studioless,'sub','Foreign Company R12',
            (SELECT id FROM public.studio_contacts WHERE organization_id=v_leah AND entity_kind='company' LIMIT 1));
    RAISE NOTICE 'A4 company_id on the studio-less job LANDED (r7 posture kept)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_ok = MESSAGE_TEXT;
    RAISE NOTICE 'A4 refused: %', v_ok;
  END;

  -- 5. cross-tenant sweep for Z on every object this wave adds
  SELECT count(*) INTO n FROM public.studio_compliance_documents;  RAISE NOTICE 'Z reads compliance docs: %', n;
  SELECT count(*) INTO n FROM public.project_party_authority;      RAISE NOTICE 'Z reads authority grants: %', n;
  SELECT count(*) INTO n FROM public.project_site_access_cards;    RAISE NOTICE 'Z reads site access cards: %', n;
  SELECT count(*) INTO n FROM public.people_directory_seats;       RAISE NOTICE 'Z reads directory seats: %', n;
  SELECT count(*) INTO n FROM public.people_directory;             RAISE NOTICE 'Z reads people_directory: %', n;
  SELECT count(*) INTO n FROM public.v_access_grants;              RAISE NOTICE 'Z reads v_access_grants: %', n;
  SELECT count(*) INTO n FROM public.project_parties;              RAISE NOTICE 'Z reads raw project_parties (shipped RLS): %', n;
  RESET ROLE;
END $$;
ROLLBACK;
