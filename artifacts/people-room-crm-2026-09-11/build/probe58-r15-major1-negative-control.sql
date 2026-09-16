-- ═══════════════════════════════════════════════════════════════════════════
-- probe58 — w1b final review r15 MAJOR-1, negative control + positive control
--
-- TX 1 restores the PRE-FIX five-holder body of
-- assert_studio_contact_identity_stable() and walks the finding: one ordinary
-- PATCH /rest/v1/studio_contacts by a member of two studios moves a card that
-- a seat is stamped with, and the working studio loses the Directory row while
-- its own seat still nests under that person_id.
-- TX 2 runs the identical walk against the SHIPPED (six-holder) body.
--
-- Seeded objects only (pnpm supabase:reset). Both transactions ROLLBACK.
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f .../probe58-r15-major1-negative-control.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── TX 1: the PRE-FIX body ────────────────────────────────────────────────
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- the five-holder body, exactly as 00593 carried it before r15 MAJOR-1
CREATE OR REPLACE FUNCTION public.assert_studio_contact_identity_stable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_holders text[] := ARRAY[]::text[];
  v_n       integer;
BEGIN
  IF NEW.entity_kind    IS NOT DISTINCT FROM OLD.entity_kind
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_n FROM public.studio_contact_channels c WHERE c.owner_id = OLD.id;
  IF v_n > 0 THEN v_holders := v_holders || (v_n || ' reach channel(s) on this card'); END IF;
  SELECT count(*) INTO v_n FROM public.studio_contacts sc
   WHERE sc.paperwork_contact_person_id = OLD.id
      OR sc.signer_person_id = OLD.id OR sc.site_contact_person_id = OLD.id;
  IF v_n > 0 THEN v_holders := v_holders || (v_n || ' designation(s) naming it on other cards'); END IF;
  SELECT count(*) INTO v_n FROM public.studio_contact_rules r WHERE r.route_to_person_id = OLD.id;
  IF v_n > 0 THEN v_holders := v_holders || (v_n || ' contact rule(s) routing to it'); END IF;
  SELECT count(*) INTO v_n FROM public.studio_contact_rules r
   WHERE r.subject_type IN ('person','company') AND r.subject_id = OLD.id;
  IF v_n > 0 THEN v_holders := v_holders || (v_n || ' contact rule(s) filed against this card'); END IF;
  SELECT count(*) INTO v_n FROM public.studio_person_affiliations a
   WHERE a.person_id = OLD.id OR a.company_id = OLD.id;
  IF v_n > 0 THEN v_holders := v_holders || (v_n || ' affiliation(s) standing on it'); END IF;
  IF array_length(v_holders, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'studio_contact_identity_held'
      USING HINT = 'pre-fix five-holder body: ' || array_to_string(v_holders, ', ');
  END IF;
  RETURN NEW;
END; $$;

DO $$
DECLARE
  designer UUID := 'a0000000-0000-0000-0000-000000000004';  -- member of BOTH studios
  admin_a  UUID := 'a0000000-0000-0000-0000-000000000003';  -- Local Dev only
  localdev UUID := 'b0000000-0000-0000-0000-000000000001';
  leah     UUID;  -- the designer's OTHER active design studio (id is seed-generated)
  proj     UUID := 'b0000000-0000-0000-0000-00000000c0d1';  -- Cedar Lane Study
  card     UUID := 'f8000000-0000-4000-8000-000000000058';
  seat     UUID := 'f8100000-0000-4000-8000-000000000058';
  ph       TEXT := '+16125556622';
  n        INTEGER;
  w        TEXT;
BEGIN
  SELECT o.id INTO leah
    FROM public.organizations o
    JOIN public.organization_members om ON om.organization_id = o.id
   WHERE om.user_id = designer AND om.status = 'active'
     AND o.type = 'design_studio' AND o.id <> localdev
   ORDER BY o.created_at LIMIT 1;
  IF leah IS NULL THEN
    RAISE EXCEPTION 'P58 setup: the designer must own a SECOND design studio';
  END IF;

  -- ordinary member writes: the card, the seat stamped with it, the refusal
  PERFORM pg_temp.assume_user(designer);
  INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind,
                                      full_name, company_name, phone, created_by)
  VALUES (card, localdev, 'person', 'sub', 'P58 Fresh Card', 'P58 Fresh Card LLC',
          ph, designer);
  INSERT INTO public.project_parties (id, project_id, party_kind, display_name,
                                      phone, studio_contact_id, created_by)
  VALUES (seat, proj, 'sub', 'P58 Fresh Card', ph, card, designer);
  PERFORM public.record_channel_consent(localdev, 'sms', ph, 'opted_out',
          'inbound_sms', 'Replied STOP on the P58 thread', NULL, NULL);
  PERFORM pg_temp.reset_role();

  -- BEFORE, as the working studio's admin
  PERFORM pg_temp.assume_user(admin_a);
  SELECT reach_state || ' | ' || consent_status || ' | seat_count ' || seat_count
    INTO w FROM public.people_directory WHERE person_id = card;
  RAISE NOTICE 'TX1 BEFORE  localdev admin row: %', COALESCE(w, '<no row>');
  SELECT count(*) INTO n FROM public.people_directory_seats WHERE person_id = card;
  RAISE NOTICE 'TX1 BEFORE  seats nesting under it: %', n;
  PERFORM pg_temp.reset_role();

  -- the guard's own holder count for this card, under the PRE-FIX body
  SELECT count(*) INTO n FROM public.project_parties WHERE studio_contact_id = card;
  RAISE NOTICE 'TX1 holders the guard does NOT count: % seat(s) stamped with this card', n;

  -- ONE PATCH by the member of two studios
  PERFORM pg_temp.assume_user(designer);
  BEGIN
    UPDATE public.studio_contacts SET organization_id = leah WHERE id = card;
    RAISE NOTICE 'TX1 *** CARD MOVED TO THE SECOND STUDIO — no guard fired ***';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TX1 refused: %', SQLERRM;
  END;
  PERFORM pg_temp.reset_role();

  -- AFTER, as the working studio's admin
  PERFORM pg_temp.assume_user(admin_a);
  SELECT count(*) INTO n FROM public.people_directory WHERE person_id = card;
  RAISE NOTICE 'TX1 AFTER   localdev admin: directory rows for the card      | %', n;
  SELECT count(*) INTO n FROM public.people_directory_seats WHERE person_id = card;
  RAISE NOTICE 'TX1 AFTER   localdev admin: seat rows still nesting under it | %', n;
  SELECT count(*) INTO n FROM public.studio_contacts WHERE id = card;
  RAISE NOTICE 'TX1 AFTER   localdev admin: can it read the card at all      | %', n;
  PERFORM pg_temp.reset_role();

  -- AFTER, as the member of BOTH studios: the surviving row's word
  PERFORM pg_temp.assume_user(designer);
  SELECT consent_status INTO w FROM public.people_directory WHERE person_id = card;
  RAISE NOTICE 'TX1 AFTER   identity row word      | %', COALESCE(w, '<null>');
  SELECT consent_status INTO w FROM public.people_directory_seats WHERE seat_id = seat;
  RAISE NOTICE 'TX1 AFTER   its own seat line word | %', COALESCE(w, '<null>');
  PERFORM pg_temp.reset_role();
  SELECT status INTO w FROM public.studio_channel_consent
   WHERE organization_id = localdev AND channel_kind = 'sms' AND channel_value = ph;
  RAISE NOTICE 'TX1 AFTER   and the RECORD at Local Dev Studio | %', COALESCE(w, '<null>');
END $$;

ROLLBACK;

-- ─── TX 2: the SHIPPED six-holder body ─────────────────────────────────────
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

DO $$
DECLARE
  designer UUID := 'a0000000-0000-0000-0000-000000000004';
  admin_a  UUID := 'a0000000-0000-0000-0000-000000000003';
  localdev UUID := 'b0000000-0000-0000-0000-000000000001';
  leah     UUID;  -- the designer's OTHER active design studio (id is seed-generated)
  proj     UUID := 'b0000000-0000-0000-0000-00000000c0d1';
  card     UUID := 'f8000000-0000-4000-8000-000000000058';
  seat     UUID := 'f8100000-0000-4000-8000-000000000058';
  ph       TEXT := '+16125556622';
  n        INTEGER;
  w        TEXT;
  h        TEXT;
BEGIN
  SELECT o.id INTO leah
    FROM public.organizations o
    JOIN public.organization_members om ON om.organization_id = o.id
   WHERE om.user_id = designer AND om.status = 'active'
     AND o.type = 'design_studio' AND o.id <> localdev
   ORDER BY o.created_at LIMIT 1;
  IF leah IS NULL THEN
    RAISE EXCEPTION 'P58 setup: the designer must own a SECOND design studio';
  END IF;

  PERFORM pg_temp.assume_user(designer);
  INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind,
                                      full_name, company_name, phone, created_by)
  VALUES (card, localdev, 'person', 'sub', 'P58 Fresh Card', 'P58 Fresh Card LLC',
          ph, designer);
  INSERT INTO public.project_parties (id, project_id, party_kind, display_name,
                                      phone, studio_contact_id, created_by)
  VALUES (seat, proj, 'sub', 'P58 Fresh Card', ph, card, designer);
  PERFORM public.record_channel_consent(localdev, 'sms', ph, 'opted_out',
          'inbound_sms', 'Replied STOP on the P58 thread', NULL, NULL);

  BEGIN
    UPDATE public.studio_contacts SET organization_id = leah WHERE id = card;
    RAISE NOTICE 'TX2 *** CARD MOVED — THE FIX DID NOT HOLD ***';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS h = PG_EXCEPTION_HINT;
    RAISE NOTICE 'TX2 refused: % | hint: %', SQLERRM, h;
  END;

  -- the kind flip, the other half of the same guard
  BEGIN
    UPDATE public.studio_contacts SET entity_kind = 'company' WHERE id = card;
    RAISE NOTICE 'TX2 *** KIND FLIPPED — THE FIX DID NOT HOLD ***';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TX2 kind flip refused: %', SQLERRM;
  END;

  -- a RESTATEMENT still writes, so an ordinary card edit is untouched
  UPDATE public.studio_contacts
     SET entity_kind = 'person', organization_id = localdev,
         full_name = 'P58 Fresh Card, renamed'
   WHERE id = card;
  SELECT full_name INTO w FROM public.studio_contacts WHERE id = card;
  RAISE NOTICE 'TX2 restatement still writes | %', COALESCE(w, '<null>');
  PERFORM pg_temp.reset_role();

  -- and the working studio still holds the human
  PERFORM pg_temp.assume_user(admin_a);
  SELECT count(*) INTO n FROM public.people_directory WHERE person_id = card;
  RAISE NOTICE 'TX2 localdev admin: directory rows for the card      | %', n;
  SELECT count(*) INTO n FROM public.people_directory_seats WHERE person_id = card;
  RAISE NOTICE 'TX2 localdev admin: seat rows nesting under it       | %', n;
  SELECT consent_status INTO w FROM public.people_directory WHERE person_id = card;
  RAISE NOTICE 'TX2 localdev admin: the identity word                | %', COALESCE(w, '<null>');
  PERFORM pg_temp.reset_role();

  -- the way out is the room's own door: close the seat, then the card moves
  DELETE FROM public.project_parties WHERE id = seat;
  PERFORM pg_temp.assume_user(designer);
  BEGIN
    UPDATE public.studio_contacts SET entity_kind = 'company' WHERE id = card;
    RAISE NOTICE 'TX2 once the seat is closed the card is free again | entity_kind company';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TX2 *** the detached card is still held: % ***', SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
END $$;

ROLLBACK;
