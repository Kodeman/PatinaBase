\pset pager off
-- probe189 — r11 MAJOR-3, the fix and its controls.
--
-- probe184's walk verbatim: Z is a plain member of Leah Hartwell, the designer
-- of record's SECOND design studio, and of nothing else; Aspen Loft Refresh is
-- one of the five local projects that record no studio_id; Local Dev Studio is
-- the studio doing the work. Before: the stamped seat LANDED and the working
-- studio read a seat nesting under a card it cannot open.
--
-- CONTROLS, so the refusal is the guard and not something else:
--   1. the same writer, the same foreign card, on a job that RECORDS Local
--      Dev Studio's studio_id — must be refused by the r9 leg instead
--      (party_studio_contact_other_studio), so the two doors are told apart
--      and the new refusal is specific to a record that names no studio;
--   2. the working studio's own admin, its own card, on the studio-less job —
--      must be refused too, and with the SAME error: nothing in a record that
--      names no studio tells the studio doing the work from the second one;
--   3. the working studio's own admin, its own card, on a job that RECORDS
--      its studio — must LAND (r7 BLOCKING-1 is not inverted);
--   4. company_id and warranty_contact_person_id on the studio-less job, by
--      the working studio's admin with its own cards — must still LAND: they
--      are not the identity key and they keep r7's caller-relative posture.
BEGIN;
SET LOCAL client_min_messages=notice;
INSERT INTO public.organization_members (organization_id, user_id, role, status, joined_at)
SELECT o.id, p.id, 'member','active', now()
  FROM public.profiles p, public.organizations o
 WHERE p.email='client@patina.dev' AND o.name='Leah Hartwell';

DO $$
DECLARE z uuid; lds_admin uuid; leah uuid; v_card uuid; v_seat uuid; n int;
        lh_project uuid; own_card uuid; own_company uuid; landed boolean;
        v_org uuid; v_org_name text;
BEGIN
  SELECT id INTO z         FROM public.profiles WHERE email='client@patina.dev';
  SELECT id INTO lds_admin FROM public.profiles WHERE email='studio_manager@patina.dev';
  SELECT id INTO leah      FROM public.organizations WHERE name='Leah Hartwell';

  -- ── as Z, a member of the OTHER studio ─────────────────────────────────
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',z::text,'role','authenticated')::text, true);
  -- the card goes in the studio the CALLER-RELATIVE resolver names for Z, so
  -- the OLD guard (sc.organization_id = project_tenant_org(...)) would have
  -- accepted this exact write. That is the door being walked.
  SELECT public.project_tenant_org('b0000000-0000-0000-0000-0000000000d1') INTO v_org;
  SELECT name INTO v_org_name FROM public.organizations WHERE id = v_org;
  RAISE NOTICE 'Z member of Local Dev Studio? %   of Leah Hartwell? %   project_tenant_org(Aspen Loft, as Z) = % (%)',
    public.is_active_studio_member('b0000000-0000-0000-0000-000000000001'),
    public.is_active_studio_member(leah), v_org, v_org_name;
  IF v_org IS NULL OR v_org = 'b0000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'the walk needs a caller-relative tenant that is NOT the studio doing the work; got %', COALESCE(v_org::text,'NULL');
  END IF;
  RAISE NOTICE 'project_recorded_studio(Aspen Loft) = %  <-- the record names none',
    COALESCE(public.project_recorded_studio('b0000000-0000-0000-0000-0000000000d1')::text,'NULL');

  INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, created_by)
  VALUES (v_org,'person','sub','Foreign Card Wendell', z)
  RETURNING id INTO v_card;
  RAISE NOTICE 'Z filed a card in %, the studio the old guard would have checked against: %', v_org_name, v_card;

  landed := true;
  BEGIN
    INSERT INTO public.project_parties (project_id, party_kind, display_name, studio_contact_id)
    VALUES ('b0000000-0000-0000-0000-0000000000d1','sub','Foreign Card Wendell', v_card)
    RETURNING id INTO v_seat;
  EXCEPTION WHEN raise_exception THEN
    landed := false;
    RAISE NOTICE 'the foreign stamp on Local Dev Studio''s job was REFUSED: %  <-- assert_project_party_cards', SQLERRM;
    IF SQLERRM <> 'party_card_project_has_no_studio' THEN RAISE; END IF;
  END;
  IF landed THEN
    RAISE EXCEPTION 'r11 MAJOR-3 NOT FIXED: the stamped seat % LANDED on the working studio''s job', v_seat;
  END IF;

  -- CONTROL 1: the same writer, the same foreign card, on a job that RECORDS
  -- the working studio — the r9 leg answers, not the new one
  landed := true;
  BEGIN
    INSERT INTO public.project_parties (project_id, party_kind, display_name, studio_contact_id)
    VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Foreign Card Wendell', v_card)
    RETURNING id INTO v_seat;
  EXCEPTION WHEN raise_exception THEN
    landed := false;
    RAISE NOTICE 'CONTROL 1 — the same foreign card on a job that RECORDS the working studio is refused by the r9 leg: %', SQLERRM;
    IF SQLERRM <> 'party_studio_contact_other_studio' THEN RAISE; END IF;
  END;
  IF landed THEN
    RAISE EXCEPTION 'CONTROL 1 landed — r9 MAJOR-2''s own guard is gone';
  END IF;
  RESET ROLE;

  -- ── as the admin of the studio doing the work ──────────────────────────
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',lds_admin::text,'role','authenticated')::text, true);
  SELECT id INTO own_card FROM public.studio_contacts
   WHERE organization_id='b0000000-0000-0000-0000-000000000001' AND entity_kind='person' LIMIT 1;
  SELECT id INTO own_company FROM public.studio_contacts
   WHERE organization_id='b0000000-0000-0000-0000-000000000001' AND entity_kind='company' LIMIT 1;

  -- CONTROL 2: its OWN card, on the studio-less job — refused the same way
  landed := true;
  BEGIN
    INSERT INTO public.project_parties (project_id, party_kind, display_name, studio_contact_id)
    VALUES ('b0000000-0000-0000-0000-0000000000d1','sub','R11 Own Card', own_card);
  EXCEPTION WHEN raise_exception THEN
    landed := false;
    RAISE NOTICE 'CONTROL 2 — the working studio''s OWN card on its own studio-less job is refused too: %', SQLERRM;
    IF SQLERRM <> 'party_card_project_has_no_studio' THEN RAISE; END IF;
  END;
  IF landed THEN
    RAISE EXCEPTION 'CONTROL 2 landed — the refusal is caller-relative, which is the defect, not the fix';
  END IF;

  -- CONTROL 3: its OWN card, on a job that RECORDS its studio — lands
  INSERT INTO public.project_parties (project_id, party_kind, display_name, studio_contact_id)
  VALUES ('b0000000-0000-0000-0000-00000000c0d1','sub','R11 Own Card', own_card)
  RETURNING id INTO v_seat;
  RAISE NOTICE 'CONTROL 3 — its own card on a job that RECORDS its studio LANDED: %  (r7 BLOCKING-1 not inverted)', v_seat;

  -- CONTROL 4: the firm pointer and the warranty contact still land on the
  -- studio-less job — they are not the identity key
  INSERT INTO public.project_parties (project_id, party_kind, display_name,
                                      company_id, warranty_contact_person_id)
  VALUES ('b0000000-0000-0000-0000-0000000000d1','sub','R11 Firm Pointer',
          own_company, own_card)
  RETURNING id INTO v_seat;
  RAISE NOTICE 'CONTROL 4 — company_id + warranty_contact_person_id on the studio-less job still LAND: %  (block 14''s posture, r7 BLOCKING-1)', v_seat;

  SELECT count(*) INTO n FROM public.studio_contacts WHERE id = v_card;
  RAISE NOTICE 'and the working studio still reads % row(s) of the foreign card — unchanged', n;
  RESET ROLE;
END $$;
ROLLBACK;
