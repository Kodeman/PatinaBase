-- ═══════════════════════════════════════════════════════════════════════════
-- probe59 — w1b final review r15 MAJOR-2, negative control + positive control
--
-- The CONTACTS branch (00626:1834) read reach_state_for(sc.profile_id, sc.id,
-- NULL). That function's card leg is a plain field_link_tokens JOIN
-- project_parties on pp.studio_contact_id alone — no projects join, no tenant
-- leg. This probe stages the pre-00624 shape (a seat wearing THIS studio's
-- card on ANOTHER studio's job), reads it as an admin of the card's studio who
-- is no member of the job's studio, and prints BOTH functions side by side:
-- the OLD expression, which is the negative control, and the SHIPPED one.
-- Then the control leg: a seat and a live link on the card's own studio's job.
--
-- Seeded objects only (pnpm supabase:reset). One transaction, ROLLBACK.
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f .../probe59-r15-major2-negative-control.sql
-- ═══════════════════════════════════════════════════════════════════════════

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
  designer UUID := 'a0000000-0000-0000-0000-000000000004';  -- owner of both studios
  admin_a  UUID := 'a0000000-0000-0000-0000-000000000003';  -- admin of Local Dev only
  localdev UUID := 'b0000000-0000-0000-0000-000000000001';
  leah     UUID;  -- the designer's OTHER active design studio (id is seed-generated)
  proj_a   UUID := 'd0e00000-0000-0000-0000-00000000000a';  -- Okonkwo, Local Dev
  proj_c   UUID := 'f9000000-0000-4000-8000-000000000059';  -- a job of the OTHER studio
  card     UUID := 'f9100000-0000-4000-8000-000000000059';
  seat_c   UUID := 'f9200000-0000-4000-8000-000000000059';
  seat_a   UUID := 'f9300000-0000-4000-8000-000000000059';
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
    RAISE EXCEPTION 'P59 setup: the designer must own a SECOND design studio';
  END IF;

  INSERT INTO public.projects (id, name, designer_id, studio_id, created_by, status)
  VALUES (proj_c, 'P59 other-studio job', designer, leah, designer, 'active');

  INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind,
                                      full_name, company_name, created_by)
  VALUES (card, localdev, 'person', 'sub', 'P59 Shared Human', 'P59 Shared Human LLC',
          designer);

  -- The legacy row: no live write path can mint it (R-AP refuses it), which is
  -- exactly the population 00624:724-739's preflight is owed for.
  ALTER TABLE public.project_parties DISABLE TRIGGER assert_project_party_cards_trg;
  INSERT INTO public.project_parties (id, project_id, party_kind, display_name,
                                      studio_contact_id, created_by)
  VALUES (seat_c, proj_c, 'sub', 'P59 Shared Human', card, designer);
  ALTER TABLE public.project_parties ENABLE TRIGGER assert_project_party_cards_trg;

  INSERT INTO public.field_link_tokens (party_id, project_id, token_hash, expires_at, status)
  VALUES (seat_c, proj_c, encode(extensions.digest('p59-token-c','sha256'),'hex'),
          now() + interval '30 days', 'active');

  PERFORM pg_temp.assume_user(admin_a);
  RAISE NOTICE 'member_of_leah % | member_of_localdev %',
    public.is_active_studio_member(leah), public.is_active_studio_member(localdev);

  -- the premise: this caller really does read both base rows raw
  SELECT count(*) INTO n FROM public.project_parties WHERE id = seat_c;
  RAISE NOTICE 'foreign seat readable raw   | %', n;
  SELECT count(*) INTO n FROM public.field_link_tokens WHERE party_id = seat_c;
  RAISE NOTICE 'foreign link readable raw   | %', n;
  SELECT count(*) INTO n FROM public.people_directory_seats WHERE person_id = card;
  RAISE NOTICE 'seats nested under the card | %', n;

  -- THE NEGATIVE CONTROL: the expression the contacts branch used to carry
  RAISE NOTICE 'OLD  reach_state_for(profile, card, NULL)        | %',
    public.reach_state_for(NULL, card, NULL);
  -- THE SHIPPED ONE
  RAISE NOTICE 'NEW  reach_state_for_identity(profile, card)     | %',
    public.reach_state_for_identity(NULL, card::text);

  SELECT reach_state || ' | seat_count ' || seat_count INTO w
    FROM public.people_directory WHERE person_id = card;
  RAISE NOTICE 'the Directory row                               | %', COALESCE(w, '<no row>');
  PERFORM pg_temp.reset_role();

  -- THE CONTROL: the same card, a seat and a live link on the card's OWN
  -- studio's job. The predicate must refuse a foreign door, not every door.
  INSERT INTO public.project_parties (id, project_id, party_kind, display_name,
                                      studio_contact_id, created_by)
  VALUES (seat_a, proj_a, 'sub', 'P59 Shared Human', card, designer);
  INSERT INTO public.field_link_tokens (party_id, project_id, token_hash, expires_at, status)
  VALUES (seat_a, proj_a, encode(extensions.digest('p59-token-a','sha256'),'hex'),
          now() + interval '30 days', 'active');

  PERFORM pg_temp.assume_user(admin_a);
  SELECT reach_state || ' | seat_count ' || seat_count INTO w
    FROM public.people_directory WHERE person_id = card;
  RAISE NOTICE 'CONTROL the Directory row with its OWN link      | %', COALESCE(w, '<no row>');
  SELECT reach_state INTO w FROM public.people_directory_seats WHERE seat_id = seat_a;
  RAISE NOTICE 'CONTROL the seat line beneath it                | %', COALESCE(w, '<null>');
  PERFORM pg_temp.reset_role();
END $$;

ROLLBACK;
