\pset pager off
-- probe204 (r12 FIX, M2) — the same walk probe197 made: a carded human's
-- UNSTAMPED seat on the same phone must now collapse into her card's one
-- identity row: 62 rows stay 62, her row claims 3 seats and nests 3, and the
-- new seat comes out of the INSERT already carrying her card.
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE d uuid; card uuid; ph text; n int; r record; before_rows int; after_rows int;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';
  SELECT sc.id, sc.phone_e164 INTO card, ph
    FROM public.studio_contacts sc
   WHERE sc.organization_id='b0000000-0000-0000-0000-000000000001'
     AND sc.full_name='Dana Kowalski';
  RAISE NOTICE 'Dana card=%  phone=%', card, ph;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
  SELECT count(*) INTO before_rows FROM public.people_directory;
  FOR r IN SELECT person_id, role, display_name, seat_count, consent_status
             FROM public.people_directory WHERE display_name='Dana Kowalski' LOOP
    RAISE NOTICE 'BEFORE  person_id=% role=% seats=% consent=%', r.person_id, r.role, r.seat_count, r.consent_status;
  END LOOP;
  RESET ROLE;

  -- the studio adds one more seat for the SAME human on the SAME number and
  -- simply does not stamp the card (the ordinary Add-to-roster path)
  INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164, trade)
  VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Dana Kowalski', ph, 'electrical');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
  SELECT count(*) INTO after_rows FROM public.people_directory;
  FOR r IN SELECT person_id, role, display_name, seat_count, consent_status
             FROM public.people_directory WHERE display_name='Dana Kowalski' LOOP
    RAISE NOTICE 'AFTER   person_id=% role=% seats=% consent=%', r.person_id, r.role, r.seat_count, r.consent_status;
  END LOOP;
  RAISE NOTICE 'people_directory rows: % -> %  (one human, one new seat)', before_rows, after_rows;
  SELECT count(*) INTO n FROM public.people_directory_seats
   WHERE display_name='Dana Kowalski';
  RAISE NOTICE 'people_directory_seats rows for Dana: %', n;
  FOR r IN SELECT identity_key, person_id, seat_id, project_name FROM public.people_directory_seats
            WHERE display_name='Dana Kowalski' LOOP
    RAISE NOTICE '   seat identity_key=% person_id=% project=%', r.identity_key, r.person_id, r.project_name;
  END LOOP;
  RESET ROLE;

  -- the record itself, not just the reader: the seat came out of an ordinary
  -- INSERT already stamped.
  SELECT count(*) INTO n FROM public.project_parties pp
   WHERE pp.project_id='d0e00000-0000-0000-0000-00000000000a'
     AND pp.phone_e164 = ph AND pp.studio_contact_id = card;
  RAISE NOTICE 'RECORD: seats on Okonkwo carrying Dana''s number AND her card stamp: %', n;
  SELECT count(*) INTO n FROM public.project_parties pp
   WHERE pp.phone_e164 = ph AND pp.studio_contact_id IS NULL;
  RAISE NOTICE 'RECORD: seats anywhere carrying Dana''s number and NO stamp: %', n;
END $$;

-- ── the mirror: the card written AFTER the seat ───────────────────────────
DO $$
DECLARE d uuid; n int; r record; card uuid;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';

  -- an inline add for a human with no rolodex card at all
  INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164, trade)
  VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Later Card','+16125559911','plumbing');
  SELECT studio_contact_id INTO card FROM public.project_parties
   WHERE display_name='Later Card';
  RAISE NOTICE 'MIRROR: the seat starts unstamped (studio_contact_id=%)', card;

  -- next week the studio writes her card, on the same number
  INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, phone, created_by)
  VALUES ('b0000000-0000-0000-0000-000000000001','person','trade','Later Card','+16125559911', d)
  RETURNING id INTO card;
  RAISE NOTICE 'MIRROR: card minted = %', card;
  SELECT count(*) INTO n FROM public.project_parties
   WHERE display_name='Later Card' AND studio_contact_id = card;
  RAISE NOTICE 'MIRROR: seats now carrying that card: %', n;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.people_directory WHERE display_name='Later Card';
  RAISE NOTICE 'MIRROR: people_directory rows for that human: %', n;
  RESET ROLE;
END $$;

-- ── the ambiguity control: two cards share the number, nobody is stamped ──
DO $$
DECLARE d uuid; n int;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';
  INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, phone, created_by)
  VALUES ('b0000000-0000-0000-0000-000000000001','person','trade','Twin One','+16125559922', d),
         ('b0000000-0000-0000-0000-000000000001','person','trade','Twin Two','+16125559922', d);
  INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164, trade)
  VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Twin Seat','+16125559922','framing');
  SELECT count(*) INTO n FROM public.project_parties
   WHERE display_name='Twin Seat' AND studio_contact_id IS NULL;
  RAISE NOTICE 'AMBIGUITY: two cards share the number, so the seat stays unstamped: % of 1', n;
END $$;
ROLLBACK;
